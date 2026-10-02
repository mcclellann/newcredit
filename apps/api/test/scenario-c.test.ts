import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

async function create() {
  const response = await app!.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-c' } })
  expect(response.statusCode).toBe(201)
  return response.json()
}

function multipart(content: Buffer, filename: string, type: string) {
  const boundary = 'newcredit-test-boundary'
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--\r\n`)]),
  }
}

describe('Scenario C document intake and review', () => {
  it('stages idempotently, processes exact blockers and withholds every downstream action', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const created = await create()
    expect(created).toMatchObject({ scenarioId: 'scenario-c', status: 'documents_required', documents: [], review: null })

    const first = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents/stage-demo` })
    const retry = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/documents/stage-demo` })
    expect(first.json().documents).toHaveLength(7)
    expect(retry.json().documents).toHaveLength(7)
    expect(retry.json().documents.every((document: any) => document.status === 'uploaded')).toBe(true)

    const processed = await app.inject({ method: 'POST', url: `/api/v1/applications/${created.id}/document-processing` })
    expect(processed.json()).toMatchObject({ status: 'needs_review', version: 2, review: null })
    expect(processed.json().documents.filter((document: any) => document.status === 'processed')).toHaveLength(6)
    expect(processed.json().documents.filter((document: any) => document.status === 'needs_review')).toHaveLength(1)

    const review = (await app.inject({ method: 'GET', url: `/api/v1/applications/${created.id}/document-review` })).json()
    expect(review.blockers).toHaveLength(2)
    expect(review.blockers.map((blocker: any) => blocker.check).sort()).toEqual(['field_readability', 'required_statement_coverage'])
    expect(review.blockers.find((blocker: any) => blocker.check === 'required_statement_coverage').data).toMatchObject({ account_id: 'ACCT-SYN-C1', missing_periods: [{ start: '2026-07-01', end: '2026-07-31' }] })
    expect(review.extractedFields.find((field: any) => field.fieldName === 'licence_number')).toMatchObject({ rawValue: '[UNREADABLE]', normalizedValue: null, confidence: '0.12', sourceLocation: { page: 1, line: 'Licence' }, reviewRequired: true })
    expect(review.auditEvents.map((event: any) => event.type)).toEqual(['synthetic_consent_recorded', 'documents_uploaded', 'extraction_needs_review', 'document_checks_need_review', 'application_review_required'])

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
