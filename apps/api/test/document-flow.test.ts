import { afterEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { loadScenarioDocumentData } from '@newcredit/test-fixtures'
import { unzipSync } from 'fflate'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { createDatabase } from '../src/db.js'
import { blankPdf, multipart } from './document-helpers.js'

let app: FastifyInstance
const temporary: string[] = []
afterEach(async () => { await app?.close(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
const url = (id: string, suffix = '') => `/api/v1/applications/${id}${suffix}`
async function create(customerType = 'new') {
  const response = await app.inject({ method: 'POST', url: '/api/v1/applications', payload: { customerType } })
  expect(response.statusCode, response.body).toBe(201)
  return response.json()
}
async function get(id: string) { return (await app.inject(url(id))).json() }
async function upload(id: string, document: any, comment = 'independent bytes') {
  const response = await app.inject({ method: 'POST', url: url(id, `/documents?documentType=${document.document_type}`), ...multipart(Buffer.concat([document.bytes, Buffer.from(`\n% ${comment}\n`)]), 'arbitrary.pdf') })
  expect(response.statusCode, response.body).toBe(201)
  return response.json()
}
async function stage(id: string, type: string) {
  const response = await app.inject({ method: 'POST', url: url(id, `/document-processing?documentType=${type}`) })
  expect(response.statusCode, response.body).toBe(200)
  return response.json()
}
async function pack(id: string, omit?: (d: any) => boolean) {
  const fixture = await loadScenarioDocumentData('scenario-a')
  for (const type of ['drivers_licence', 'payslip', 'bank_statement']) {
    for (const d of fixture.documents.filter((d: any) => d.document_type === type && !omit?.(d))) await upload(id, d)
    await stage(id, type)
  }
  return fixture
}
async function details(id: string, amountMinor = 500000, termYears = 5) {
  const application = await get(id)
  const classifications = { ...application.declarations.classifications, ...Object.fromEntries(application.transactions.filter((t: any) => ['cash', 'unclassified_debit', 'unclassified_credit'].includes(t.category)).map((t: any) => [t.id, t.amountMinor > 0 ? 'refund' : 'living'])) }
  return { loan: { amountMinor, termYears, purposeDetail: 'Synthetic household purchase' }, customer: { email: 'synthetic@example.test', phone: '0400000000' }, declarations: { ...application.declarations, classifications, confirmed: true, allAccountsConfirmed: true, incomeContinuing: true } }
}
async function confirm(id: string, body?: any) {
  const response = await app.inject({ method: 'PUT', url: url(id, '/details'), payload: body ?? await details(id) })
  expect(response.statusCode, response.body).toBe(200)
  return response.json()
}
async function withheld(id: string) {
  for (const suffix of ['/outcome', '/offer']) expect((await app.inject(url(id, suffix))).statusCode).toBe(409)
  const response = await app.inject({ method: 'POST', url: url(id, '/submission'), headers: { 'idempotency-key': `blocked-${id}` }, payload: { confirmation: true } })
  expect(response.statusCode, response.body).toBe(409)
}
async function submit(id: string) {
  const options = { method: 'POST' as const, url: url(id, '/submission'), headers: { 'idempotency-key': `submit-${id}` }, payload: { confirmation: true } }
  const first = await app.inject(options)
  expect(first.statusCode, first.body).toBe(200)
  expect((await app.inject(options)).json()).toEqual(first.json())
  return (await app.inject(url(id, '/outcome'))).json()
}

it('starts empty without a stored outcome; sample downloads do not select application behavior', async () => {
  const database = createDatabase(':memory:')
  app = await buildApp({ database, migrate: true })
  for (const type of ['new', 'existing']) {
    const application = await create(type)
    expect(application).toMatchObject({ scenarioId: 'document-driven', customer: { type, name: '' }, documents: [], accounts: [], review: null })
    expect(database.sqlite.prepare('SELECT outcome_snapshot FROM applications WHERE id = ?').get(application.id)).toEqual({ outcome_snapshot: null })
    for (const sample of ['scenario-a', 'scenario-b', 'scenario-h']) {
      const response = await app.inject(url(application.id, `/documents/demo-pack?pack=${sample}`))
      expect(response.statusCode).toBe(200)
      expect(Object.keys(unzipSync(response.rawPayload)).length).toBeGreaterThan(0)
    }
    expect(await get(application.id)).toEqual(application)
    await withheld(application.id)
  }
})

it('extracts altered PDF bytes, confirms unknown living costs, and varies affordability with loan inputs', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const outcomes = []
  for (const [amount, term] of [[500000, 5], [10000000, 1]]) {
    const { id } = await create()
    await pack(id)
    const extracted = await get(id)
    expect(extracted.customer.name).toBe('AVERY EXAMPLE')
    expect(extracted.review.monthlyNetIncome.amountMinor).toBeGreaterThan(0)
    expect(extracted.transactions.some((t: any) => t.category === 'unclassified_debit')).toBe(true)
    await withheld(id)
    expect((await confirm(id, await details(id, amount, term))).status).toBe('ready_to_submit')
    expect((await app.inject(url(id, '/outcome'))).statusCode).toBe(409)
    outcomes.push(await submit(id))
  }
  expect(outcomes[0]).toMatchObject({ affordability: 'affordable', decision: 'indicatively_approved' })
  expect(outcomes[1]).toMatchObject({ affordability: 'unaffordable', decision: 'not_approved' })
  expect(outcomes[0].monthlySurplus.amountMinor).toBeGreaterThan(outcomes[1].monthlySurplus.amountMinor)
})

it('prefills statement-derived figures for validation without overwriting saved customer corrections', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const { id } = await create()
  const fixture = await pack(id)
  const filled = await get(id)
  // Source statements: non-housing spending 5,597.68 / 3, rent 4,200 / 3;
  // category-level rounding rounds each monthly subtotal up to a whole cent.
  expect(filled.declarations).toMatchObject({ declaredLivingMinor: 186590, declaredHousingMinor: 140000, declaredDebtRepaymentsMinor: 0, assetsMinor: 1063349, liabilitiesMinor: 0, confirmed: false })
  expect(filled.review.assessedLivingExpenses.amountMinor).toBe(204932)
  expect(filled.customer.email).toBe('')
  expect(filled.loan.purposeDetail).toBe('')
  await withheld(id)

  const september = fixture.documents.find((d: any) => d.file.endsWith('bank-statement-2026-09.pdf'))
  const stored = (await app.inject(url(id, '/documents'))).json().documents.find((d: any) => d.originalName === 'arbitrary.pdf' && d.periodEnd === '2026-09-30' && d.type === 'bank_statement')
  await app.inject({ method: 'DELETE', url: url(id, `/documents/${stored.id}`) })
  expect((await get(id)).declarations.assetsMinor).toBe(803340)
  await upload(id, september); await stage(id, 'bank_statement')
  expect((await get(id)).declarations.assetsMinor).toBe(1063349)

  const body = await details(id)
  Object.assign(body.declarations, { declaredLivingMinor: 0, declaredHousingMinor: 98765, declaredDebtRepaymentsMinor: 4321, assetsMinor: 123456, liabilitiesMinor: 456789 })
  await confirm(id, body)
  // Zero is a valid customer correction, not an unfilled field. New uploads must
  // invalidate consent but must not replace any previously saved declarations.
  await upload(id, { document_type: 'payslip', bytes: blankPdf() })
  await stage(id, 'payslip')
  const corrected = await get(id)
  expect(corrected.declarations).toMatchObject({ ...body.declarations, confirmed: false })
  expect(corrected.review.assessedLivingExpenses.amountMinor).toBe(204932)
  expect(corrected.review.monthlyHousing.amountMinor).toBe(140000)

  const overdrawn = await create()
  const h = await loadScenarioDocumentData('scenario-h')
  for (const type of ['drivers_licence', 'payslip', 'bank_statement']) {
    for (const document of h.documents.filter((d: any) => d.document_type === type)) await upload(overdrawn.id, document)
    await stage(overdrawn.id, type)
  }
  // The latest statement closes at -$500: a liability, never a negative asset
  // or a sum of all three historical closing balances.
  expect((await get(overdrawn.id)).declarations).toMatchObject({ assetsMinor: 0, liabilitiesMinor: 50000, confirmed: false })
})

it('persists evidence and idempotent submission, acceptance and funding across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'newcredit-contract-')); temporary.push(dir)
  const databaseUrl = join(dir, 'api.sqlite')
  app = await buildApp({ databaseUrl, migrate: true })
  const { id } = await create()
  await pack(id)
  expect((await confirm(id)).status).toBe('ready_to_submit')
  const before = await get(id)
  await app.close()
  app = await buildApp({ databaseUrl, migrate: true })
  expect(await get(id)).toEqual(before)
  await submit(id)
  const offer = (await app.inject(url(id, '/offer'))).json()
  for (const [action, status] of [['acceptance', 200], ['disbursement', 201]] as const) {
    const options = { method: 'POST' as const, url: `/api/v1/offers/${offer.id}/${action}`, headers: { 'idempotency-key': action } }
    const first = await app.inject(options)
    expect(first.statusCode, first.body).toBe(status)
    expect((await app.inject(options)).json()).toEqual(first.json())
    expect((await app.inject({ ...options, headers: { 'idempotency-key': `${action}-different` } })).statusCode).toBe(409)
  }
  expect((await get(id)).status).toBe('funded')
})

it('rejects invalid loan inputs, sign-incompatible unknown classifications and unconfirmed accounts', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const { id } = await create(); await pack(id)
  const body = await details(id)
  for (const loan of [{ ...body.loan, amountMinor: 499999 }, { ...body.loan, amountMinor: 10000001 }, { ...body.loan, termYears: 0 }, { ...body.loan, termYears: 6 }, { ...body.loan, termYears: 1.5 }]) {
    expect((await app.inject({ method: 'PUT', url: url(id, '/details'), payload: { ...body, loan } })).statusCode).toBe(400)
  }
  const unknown = (await get(id)).transactions.find((t: any) => t.category === 'unclassified_debit')
  expect(unknown).toBeDefined()
  const invalid = await app.inject({ method: 'PUT', url: url(id, '/details'), payload: { ...body, declarations: { ...body.declarations, classifications: { [unknown.id]: 'salary' } } } })
  expect(invalid.statusCode, invalid.body).toBe(422)
  expect((await confirm(id, { ...body, declarations: { ...body.declarations, allAccountsConfirmed: false } })).status).toBe('needs_review')
  await withheld(id)
  expect((await confirm(id, body)).status).toBe('ready_to_submit')
})

it('blocks byte-altered duplicate pay evidence instead of doubling salary and permits removal', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const { id } = await create(); const fixture = await pack(id)
  expect((await confirm(id)).status).toBe('ready_to_submit')
  const income = (await get(id)).review.monthlyNetIncome.amountMinor
  const duplicate = await upload(id, fixture.documents.find((d: any) => d.document_type === 'payslip'), 'different duplicate bytes')
  await stage(id, 'payslip'); await confirm(id)
  await withheld(id)
  expect((await get(id)).review.monthlyNetIncome.amountMinor).toBe(income)
  expect((await app.inject({ method: 'DELETE', url: url(id, `/documents/${duplicate.id}`) })).statusCode).toBe(200)
  expect((await confirm(id)).status).toBe('ready_to_submit')
})

it('withholds mismatched identity and unreadable PDF evidence until removed and replaced', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const { id } = await create(); await pack(id)
  const c = await loadScenarioDocumentData('scenario-c')
  const wrong = await upload(id, c.documents.find((d: any) => d.document_type === 'drivers_licence'))
  await stage(id, 'drivers_licence'); await confirm(id); await withheld(id)
  await app.inject({ method: 'DELETE', url: url(id, `/documents/${wrong.id}`) })
  const unreadable = await upload(id, { document_type: 'drivers_licence', bytes: blankPdf() })
  await stage(id, 'drivers_licence'); await confirm(id); await withheld(id)
  await app.inject({ method: 'DELETE', url: url(id, `/documents/${unreadable.id}`) })
  expect((await confirm(id)).status).toBe('ready_to_submit')
})

it('requires identity for existing customers too; sample selection does not grant an exemption', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  for (const sample of ['scenario-b', 'scenario-h'] as const) {
    const { id } = await create('existing')
    const fixture = await loadScenarioDocumentData(sample)
    for (const document of fixture.documents.filter((d: any) => d.document_type !== 'drivers_licence')) await upload(id, document)
    const response = await app.inject({ method: 'POST', url: url(id, '/document-processing?documentType=payslip') })
    expect(response.statusCode).toBe(409)
    expect(response.json().detail).toMatch(/drivers_licence/)
    await withheld(id)
  }
})

it('requires each account statement window and allows missing evidence to be added', async () => {
  app = await buildApp({ databaseUrl: ':memory:', migrate: true })
  const { id } = await create()
  const fixture = await loadScenarioDocumentData('scenario-a')
  const missing = fixture.documents.find((d: any) => d.document_type === 'bank_statement')!
  await pack(id, d => d.file === missing.file)
  await confirm(id); await withheld(id)
  const review = (await app.inject(url(id, '/document-review'))).json()
  expect(review.blockers.some((b: any) => /coverage.*account/i.test(b.details))).toBe(true)
  await upload(id, missing); await stage(id, 'bank_statement')
  expect((await confirm(id)).status).toBe('ready_to_submit')
})
