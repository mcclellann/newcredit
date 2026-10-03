import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { unzipSync } from 'fflate'
import { loadScenarioDocumentData } from '@newcredit/test-fixtures'
import { buildApp } from '../src/app.js'
import { multipart, uploadPack } from './document-helpers.js'

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

async function create() {
  const response = await app!.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-c' } })
  expect(response.statusCode).toBe(201)
  return response.json()
}

describe('Scenario C document intake and review', () => {
  it('describes and downloads only the scenario pack, and requires the complete pack', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const created = await create()
    const fixture = await loadScenarioDocumentData('scenario-c')
    const requirements = (await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/document-requirements` })).json()
    expect(requirements).toMatchObject({ expectedCount: 7, uploadedCount: 0, remainingCount: 7 })
    expect(requirements.requirements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'drivers_licence', count: 1, uploadedCount: 0, processedCount: 0 }),
      expect.objectContaining({ type: 'payslip', count: 4, uploadedCount: 0, processedCount: 0 }),
      expect.objectContaining({ type: 'bank_statement', count: 2, uploadedCount: 0, processedCount: 0 }),
    ]))
    expect(requirements.expectedDocuments.map((document: any) => document.filename).sort()).toEqual(fixture.documents.map((document: any) => document.file.split('/').at(-1)).sort())
    const pack = await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/documents/demo-pack` })
    expect(pack.headers['content-type']).toContain('application/zip')
    expect(Object.keys(unzipSync(pack.rawPayload)).sort()).toEqual(requirements.expectedDocuments.map((document: any) => document.filename).sort())
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing` })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=bank_statement` })).statusCode).toBe(409)

    const first = fixture.documents[0]
    const upload = multipart(first.bytes, '../../unsafe.pdf')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents`, ...upload })).statusCode).toBe(201)
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents`, ...upload })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents?documentType=payslip`, ...upload })).statusCode).toBe(first.document_type === 'payslip' ? 200 : 422)

    const scenarioA = await loadScenarioDocumentData('scenario-a')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents`, ...multipart(scenarioA.documents[0].bytes, 'cross-scenario.pdf') })).statusCode).toBe(422)
  })

  it('stages idempotently, processes exact blockers and withholds every downstream action', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const created = await create()
    expect(created).toMatchObject({ scenarioId: 'scenario-c', status: 'documents_required', documents: [], review: null })

    await uploadPack(app, created.id, 'scenario-c')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents/stage-demo` })).statusCode).toBe(404)
    const outOfOrder = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=bank_statement` })
    expect(outOfOrder.statusCode).toBe(409)
    expect(outOfOrder.json()).toMatchObject({ title: 'Previous Document Stage Incomplete' })

    const identity = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=drivers_licence` })
    expect(identity.json()).toMatchObject({ status: 'documents_required', version: 2, review: null })
    let partialReview = (await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/document-review` })).json()
    expect(partialReview.extractedFields.length).toBeGreaterThan(0)
    expect(partialReview.extractedFields.every((field: any) => field.documentId.includes('DOC-SYN-C-LIC'))).toBe(true)
    expect(partialReview.checks.map((check: any) => check.check).sort()).toEqual(['field_readability', 'identity_consistency'])
    const replay = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=drivers_licence` })
    expect(replay.json()).toEqual(identity.json())

    const pay = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=payslip` })
    expect(pay.json()).toMatchObject({ status: 'documents_required', version: 3 })
    partialReview = (await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/document-review` })).json()
    expect(partialReview.checks).toHaveLength(6)
    expect(partialReview.checks.some((check: any) => check.check === 'required_statement_coverage')).toBe(false)

    const processed = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing?documentType=bank_statement` })
    expect(processed.json()).toMatchObject({ status: 'needs_review', version: 4, review: null })
    expect(processed.json().documents.filter((document: any) => document.status === 'processed')).toHaveLength(6)
    expect(processed.json().documents.filter((document: any) => document.status === 'needs_review')).toHaveLength(1)

    const review = (await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/document-review` })).json()
    expect(review.blockers).toHaveLength(2)
    expect(review.blockers.map((blocker: any) => blocker.check).sort()).toEqual(['field_readability', 'required_statement_coverage'])
    expect(review.blockers.find((blocker: any) => blocker.check === 'required_statement_coverage').data).toMatchObject({ account_id: 'ACCT-SYN-C1', missing_periods: [{ start: '2026-07-01', end: '2026-07-31' }] })
    expect(review.extractedFields.find((field: any) => field.fieldName === 'licence_number')).toMatchObject({ rawValue: '[UNREADABLE]', normalizedValue: null, confidence: '0.12', sourceLocation: { page: 1, line: 'Licence' }, reviewRequired: true })
    expect(review.auditEvents.map((event: any) => event.type)).toEqual(['synthetic_consent_recorded', 'documents_uploaded', 'document_stage_processed', 'document_stage_processed', 'application_review_required'])

    const submission = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/submission`, headers: { 'idempotency-key': 'blocked' }, payload: { confirmation: true } })
    const outcome = await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/outcome` })
    const offer = await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/offer` })
    for (const response of [submission, outcome, offer]) {
      expect(response.statusCode).toBe(409)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(JSON.stringify(response.json())).toMatch(/withheld/i)
    }
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/scenario-c-missing/acceptance', headers: { 'idempotency-key': 'accept' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/scenario-c-missing/disbursement', headers: { 'idempotency-key': 'fund' } })).statusCode).toBe(404)
  })

  it('rejects mismatched, unknown, and oversized intake without persisting content', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const created = await create()
    const text = multipart(Buffer.from('not a pdf'), 'unsafe/../../name.pdf', 'text/plain')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents?documentType=bank_statement`, ...text })).statusCode).toBe(415)
    const unknown = multipart(Buffer.from('%PDF-1.4\nunknown fixture'), 'unknown.pdf', 'application/pdf')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents?documentType=bank_statement`, ...unknown })).statusCode).toBe(422)
    const oversized = multipart(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(20 * 1024 * 1024)]), 'large.pdf', 'application/pdf')
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents?documentType=bank_statement`, ...oversized })).statusCode).toBe(413)
    expect((await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/documents` })).json().documents).toHaveLength(0)
  })
})
