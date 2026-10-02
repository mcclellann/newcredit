import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import { Type } from '@sinclair/typebox'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ApplicationStatus, DemoApplication, Disbursement, Offer, Outcome } from '@newcredit/domain'
import { assertTransition } from '@newcredit/domain'
import { loadScenario, loadScenarioCDocumentData, type ScenarioId } from '@newcredit/test-fixtures'
import { createDatabase, migrateDatabase, type ApiDatabase } from './db.js'

const Id = Type.Object({ id: Type.String({ minLength: 1 }) })
const ScenarioIdSchema = Type.Union([Type.Literal('scenario-a'), Type.Literal('scenario-b'), Type.Literal('scenario-c')])
const ScenarioBody = Type.Object({ scenarioId: ScenarioIdSchema }, { additionalProperties: false })
const ConfirmationBody = Type.Object({ confirmation: Type.Literal(true) }, { additionalProperties: false })
const IdempotencyHeaders = Type.Object({ 'idempotency-key': Type.String({ minLength: 1, maxLength: 255 }) })
const MoneySchema = Type.Object({ amountMinor: Type.Integer(), currency: Type.Literal('AUD') })
const DocumentSchema = Type.Object({
  id: Type.String(), type: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]),
  issuer: Type.String(), periodStart: Type.Union([Type.String(), Type.Null()]), periodEnd: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([Type.Literal('uploaded'), Type.Literal('processing'), Type.Literal('processed'), Type.Literal('needs_review')]),
})
const ApplicationSchema = Type.Object({
  id: Type.String(), scenarioId: ScenarioIdSchema,
  status: Type.Union([Type.Literal('documents_required'), Type.Literal('processing'), Type.Literal('needs_review'), Type.Literal('ready_to_submit'), Type.Literal('submitted'), Type.Literal('referred'), Type.Literal('offer_accepted'), Type.Literal('funded')]),
  version: Type.Integer(), fixedDemonstrationDate: Type.String(),
  customer: Type.Object({ type: Type.Union([Type.Literal('new'), Type.Literal('existing')]), name: Type.String(), dateOfBirth: Type.String(), email: Type.String(), phone: Type.String(), address: Type.String(), employer: Type.String(), existingCustomerReference: Type.Optional(Type.String()), profileConfirmation: Type.Optional(Type.Object({ confirmed: Type.Boolean(), at: Type.String(), fields: Type.Array(Type.String()) })) }),
  loan: Type.Object({ amount: MoneySchema, termYears: Type.Integer(), purpose: Type.String(), purposeDetail: Type.String() }),
  documents: Type.Array(DocumentSchema),
  accounts: Type.Array(Type.Object({ id: Type.String(), type: Type.String(), ownership: Type.Union([Type.Literal('sole'), Type.Literal('joint')]), applicantShare: Type.Number(), bsbMasked: Type.String(), accountMasked: Type.String(), active: Type.Boolean() })),
  financialPosition: Type.Object({ assetsTotal: MoneySchema, liabilitiesTotal: MoneySchema, monthlyDebtRepayments: MoneySchema }),
  review: Type.Union([Type.Object({ monthlyNetIncome: MoneySchema, assessedLivingExpenses: MoneySchema, monthlyHousing: MoneySchema, classifiedTransactionCount: Type.Integer(), documentChecksPassed: Type.Integer(), transactionCategories: Type.Array(Type.Object({ category: Type.String(), count: Type.Integer() })) }), Type.Null()]),
})
const OutcomeSchema = Type.Object({
  applicationId: Type.String(), decision: Type.Union([Type.Literal('indicatively_approved'), Type.Literal('referred')]), riskScore: Type.Integer(), riskBand: Type.Union([Type.Literal('very_low'), Type.Literal('moderate')]),
  affordability: Type.Literal('affordable'), monthlySurplus: MoneySchema, reasons: Type.Array(Type.String()), factors: Type.Array(Type.Object({ factor: Type.String(), signal: Type.String(), riskValue: Type.Integer() })), illustrativeNotOffer: Type.Literal(true),
})
const OfferSchema = Type.Object({
  id: Type.String(), applicationId: Type.String(), principal: MoneySchema, termYears: Type.Integer(), annualRateBasisPoints: Type.Integer(),
  monthlyFee: MoneySchema, monthlyRepayment: MoneySchema, totalRepayable: MoneySchema,
  status: Type.Union([Type.Literal('ready'), Type.Literal('accepted'), Type.Literal('funded')]), destinationAccountMasked: Type.String(), simulationNotice: Type.String(),
})
const DisbursementSchema = Type.Object({
  id: Type.String(), offerId: Type.String(), amount: MoneySchema, status: Type.Literal('completed'), transferReference: Type.String(),
  destinationAccountMasked: Type.String(), simulationNotice: Type.String(),
})
const StoredDocumentSchema = Type.Object({
  id: Type.String(), applicationId: Type.String(), sourceHash: Type.String(), mediaType: Type.String(),
  originalName: Type.String(), type: Type.String(), issuer: Type.String(), periodStart: Type.Union([Type.String(), Type.Null()]),
  periodEnd: Type.Union([Type.String(), Type.Null()]), status: Type.String(), createdAt: Type.String(), updatedAt: Type.String(),
})
const CheckSchema = Type.Object({ documentId: Type.Union([Type.String(), Type.Null()]), check: Type.String(), status: Type.String(), details: Type.String(), data: Type.Record(Type.String(), Type.Unknown()) })
const FieldSchema = Type.Object({ id: Type.String(), documentId: Type.String(), fieldName: Type.String(), rawValue: Type.String(), normalizedValue: Type.Union([Type.String(), Type.Null()]), confidence: Type.String(), sourceLocation: Type.Record(Type.String(), Type.Unknown()), reviewRequired: Type.Boolean() })
const AuditSchema = Type.Object({ id: Type.String(), sequence: Type.Integer(), type: Type.String(), at: Type.String(), details: Type.Record(Type.String(), Type.Unknown()) })

class HttpProblem extends Error {
  constructor(readonly status: number, readonly title: string, detail: string) { super(detail) }
}

function parse<T>(value: string): T { return JSON.parse(value) as T }
function now(): string { return new Date().toISOString() }

export type BuildAppOptions = { database?: ApiDatabase; databaseUrl?: string; migrate?: boolean }

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false })
  const database = options.database ?? createDatabase(options.databaseUrl)
  const db = database.sqlite
  if (options.migrate) migrateDatabase(db)
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } })
  await app.register(cors, {
    origin: (origin, callback) => {
      const configured = new Set((process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean))
      const allowed = !origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || configured.has(origin)
      callback(null, allowed)
    },
  })
  await app.register(swagger, { openapi: { openapi: '3.1.0', info: { title: 'NewCredit Demo API', version: '1.1.0' } } })

  app.setErrorHandler((error, request, reply) => {
    const normalized = error instanceof Error ? error : new Error('Unknown error')
    const validation = 'validation' in normalized && normalized.validation
    const frameworkStatus = 'statusCode' in normalized && typeof normalized.statusCode === 'number' ? normalized.statusCode : undefined
    const status = error instanceof HttpProblem ? error.status : validation ? 400 : frameworkStatus ?? 500
    const title = error instanceof HttpProblem ? error.title : validation ? 'Bad Request' : status === 413 ? 'Document Too Large' : status < 500 ? 'Bad Request' : 'Internal Server Error'
    reply.status(status).type('application/problem+json').send({
      type: 'about:blank', title, status, detail: status === 500 ? 'An unexpected error occurred' : normalized.message,
      instance: request.url,
    })
  })

  app.get('/health', { schema: { tags: ['system'], response: { 200: Type.Object({ status: Type.Literal('ok') }) } } }, async () => ({ status: 'ok' }))
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  app.get('/api/v1/demo-scenarios', { schema: { tags: ['demo'], response: { 200: Type.Object({ scenarios: Type.Array(Type.Object({ id: ScenarioIdSchema, name: Type.String(), description: Type.String() })) }) } } }, async () => ({
    scenarios: [{ id: 'scenario-a' as const, name: 'Scenario A', description: 'Indicative approval and simulated funding' }, { id: 'scenario-b' as const, name: 'Scenario B', description: 'Existing customer referral' }, { id: 'scenario-c' as const, name: 'Scenario C', description: 'Document review required' }],
  }))

  app.post('/api/v1/demo-sessions', { schema: { tags: ['demo'], response: { 201: Type.Object({ id: Type.String(), createdAt: Type.String() }) } } }, async (_request, reply) => {
    const session = { id: randomUUID(), createdAt: now() }
    db.prepare('INSERT INTO demo_sessions (id, created_at) VALUES (?, ?)').run(session.id, session.createdAt)
    return reply.code(201).send(session)
  })

  app.post('/api/v1/demo-sessions/login', { schema: { tags: ['demo'], body: Type.Object({ scenarioId: Type.Literal('scenario-b') }), response: { 200: Type.Object({ scenarioId: Type.Literal('scenario-b'), customerReference: Type.String(), customerName: Type.String(), simulated: Type.Literal(true), notice: Type.String() }) } } }, async () => ({ scenarioId: 'scenario-b' as const, customerReference: 'EXIST-SYN-B-204', customerName: 'Morgan Sample', simulated: true as const, notice: 'Demonstration login only; this is not production authentication.' }))

  app.post('/api/v1/applications', { schema: { tags: ['applications'], body: ScenarioBody, response: { 201: ApplicationSchema } } }, async (request, reply) => {
    const scenarioId = (request.body as { scenarioId: ScenarioId }).scenarioId
    const fixture = await loadScenario(scenarioId)
    const id = randomUUID()
    const timestamp = now()
    const application: DemoApplication = { id, status: scenarioId === 'scenario-c' ? 'documents_required' : 'ready_to_submit', version: 1, ...fixture.application }
    const outcome: Outcome | null = fixture.outcome ? { applicationId: id, ...fixture.outcome } : null
    db.prepare(`INSERT INTO applications
      (id, scenario_id, status, version, snapshot, outcome_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, scenarioId, application.status, 1, JSON.stringify(application), outcome ? JSON.stringify(outcome) : null, timestamp, timestamp)
    if (scenarioId === 'scenario-c') db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, 1, ?, ?, ?)').run(randomUUID(), id, 'synthetic_consent_recorded', timestamp, '{}')
    return reply.code(201).send(application)
  })

  const getApplicationRow = (id: string) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) throw new HttpProblem(404, 'Application Not Found', `Application ${id} was not found`)
    return row
  }
  const getOfferRow = (id: string) => {
    const row = db.prepare('SELECT * FROM offers WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) throw new HttpProblem(404, 'Offer Not Found', `Offer ${id} was not found`)
    return row
  }

  const documentRows = (applicationId: string) => db.prepare(`SELECT id, application_id applicationId, source_hash sourceHash, media_type mediaType,
    original_name originalName, document_type type, issuer, period_start periodStart, period_end periodEnd, status, created_at createdAt, updated_at updatedAt
    FROM documents WHERE application_id = ? ORDER BY created_at, id`).all(applicationId) as any[]
  const storageRoot = process.env.NEWCREDIT_UPLOAD_DIR ?? join(tmpdir(), 'newcredit-documents')
  async function persistApprovedDocument(applicationId: string, bytes: Buffer, supplied: { filename: string; mimetype: string }, fixtureDocument: any) {
    const row = getApplicationRow(applicationId)
    if (row.scenario_id !== 'scenario-c' || !['documents_required', 'processing'].includes(row.status as string)) throw new HttpProblem(409, 'Document Intake Not Allowed', 'Documents are only accepted for a Scenario C application awaiting processing')
    if (bytes.length > 20 * 1024 * 1024) throw new HttpProblem(413, 'Document Too Large', 'Documents must not exceed 20 MiB')
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(supplied.mimetype)) throw new HttpProblem(415, 'Unsupported Document Type', 'Only PDF, JPEG, and PNG documents are accepted')
    const validMagic = supplied.mimetype === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : supplied.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 0xff && bytes[1] === 0xd8
    if (!validMagic) throw new HttpProblem(415, 'Invalid Document Content', 'Document content does not match its declared media type')
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    if (!fixtureDocument || fixtureDocument.content_hash !== hash) throw new HttpProblem(422, 'Document Not Recognized', 'This deterministic demo can process only approved synthetic Scenario C documents')
    const existing = db.prepare('SELECT id FROM documents WHERE application_id = ? AND source_hash = ?').get(applicationId, hash) as { id: string } | undefined
    if (existing) return documentRows(applicationId).find((document) => document.id === existing.id)
    const extension = supplied.mimetype === 'application/pdf' ? '.pdf' : supplied.mimetype === 'image/png' ? '.png' : '.jpg'
    const storageKey = `${hash.slice(7)}${extension}`
    const originalName = basename(supplied.filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || `document${extension}`
    await mkdir(storageRoot, { recursive: true })
    try { await writeFile(join(storageRoot, storageKey), bytes, { flag: 'wx', mode: 0o600 }) } catch (error: any) { if (error?.code !== 'EEXIST') throw error }
    const timestamp = now()
    const id = `${fixtureDocument.document_id}-${applicationId}`
    db.prepare(`INSERT INTO documents (id, application_id, source_hash, media_type, storage_key, original_name, document_type, issuer, period_start, period_end, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?)`).run(id, applicationId, hash, supplied.mimetype, storageKey, originalName, fixtureDocument.document_type, fixtureDocument.stated_issuer, fixtureDocument.period_start, fixtureDocument.period_end, timestamp, timestamp)
    return documentRows(applicationId).find((document) => document.id === id)
  }

  app.get('/api/v1/applications/:id', { schema: { tags: ['applications'], params: Id, response: { 200: ApplicationSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    return parse<DemoApplication>(getApplicationRow(id).snapshot as string)
  })

  app.get('/api/v1/applications/:id/documents', { schema: { tags: ['documents'], params: Id, response: { 200: Type.Object({ documents: Type.Array(StoredDocumentSchema) }) } } }, async (request) => {
    const { id } = request.params as { id: string }; getApplicationRow(id)
    return { documents: documentRows(id) }
  })

  app.post('/api/v1/applications/:id/documents', { schema: { tags: ['documents'], params: Id, querystring: Type.Object({ documentType: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]) }), response: { 201: StoredDocumentSchema, 200: StoredDocumentSchema } } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const part = await request.file()
    if (!part) throw new HttpProblem(400, 'Document Required', 'A multipart file is required')
    const bytes = await part.toBuffer()
    const fixtures = await loadScenarioCDocumentData()
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const approved = fixtures.documents.find((document: any) => document.content_hash === hash && document.document_type === (request.query as any).documentType)
    const duplicate = db.prepare('SELECT 1 FROM documents WHERE application_id = ? AND source_hash = ?').get(id, hash)
    const result = await persistApprovedDocument(id, bytes, { filename: part.filename, mimetype: part.mimetype }, approved)
    if (!db.prepare("SELECT 1 FROM application_audit_events WHERE application_id = ? AND type = 'documents_uploaded'").get(id)) {
      db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, 2, ?, ?, ?)').run(randomUUID(), id, 'documents_uploaded', now(), JSON.stringify({ via: 'multipart_intake' }))
    }
    const applicationRow = getApplicationRow(id); const application = parse<DemoApplication>(applicationRow.snapshot as string)
    application.documents = documentRows(id).map((d) => ({ id: d.id, type: d.type, issuer: d.issuer, periodStart: d.periodStart, periodEnd: d.periodEnd, status: d.status }))
    db.prepare('UPDATE applications SET snapshot = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(application), now(), id)
    return reply.code(duplicate ? 200 : 201).send(result)
  })

  app.post('/api/v1/applications/:id/documents/stage-demo', { schema: { tags: ['demo', 'documents'], params: Id, response: { 200: Type.Object({ documents: Type.Array(StoredDocumentSchema) }) } } }, async (request) => {
    const { id } = request.params as { id: string }
    const fixture = await loadScenarioCDocumentData()
    for (const document of fixture.documents) await persistApprovedDocument(id, document.bytes, { filename: document.file, mimetype: 'application/pdf' }, document)
    if (!db.prepare("SELECT 1 FROM application_audit_events WHERE application_id = ? AND type = 'documents_uploaded'").get(id)) {
      db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, 2, ?, ?, ?)').run(randomUUID(), id, 'documents_uploaded', now(), JSON.stringify({ documentCount: fixture.documents.length }))
    }
    const applicationRow = getApplicationRow(id); const application = parse<DemoApplication>(applicationRow.snapshot as string)
    application.documents = documentRows(id).map((d) => ({ id: d.id, type: d.type, issuer: d.issuer, periodStart: d.periodStart, periodEnd: d.periodEnd, status: d.status }))
    db.prepare('UPDATE applications SET snapshot = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(application), now(), id)
    return { documents: documentRows(id) }
  })

  app.post('/api/v1/applications/:id/document-processing', { schema: { tags: ['documents'], params: Id, response: { 200: ApplicationSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    const row = getApplicationRow(id)
    if (row.scenario_id !== 'scenario-c') throw new HttpProblem(409, 'Processing Not Available', 'Deterministic document processing is available only for Scenario C')
    if (row.status === 'needs_review') return parse<DemoApplication>(row.snapshot as string)
    const fixture = await loadScenarioCDocumentData()
    const documents = documentRows(id)
    if (documents.length !== fixture.documents.length) throw new HttpProblem(409, 'Documents Incomplete', `All ${fixture.documents.length} approved Scenario C documents must be uploaded before processing`)
    return db.transaction(() => {
      const started = now()
      db.prepare("UPDATE applications SET status = 'processing', updated_at = ? WHERE id = ?").run(started, id)
      db.prepare("UPDATE documents SET status = 'processing', updated_at = ? WHERE application_id = ?").run(started, id)
      for (const check of fixture.checks) {
        const documentId = check.document_id ? `${check.document_id}-${id}` : null
        db.prepare('INSERT INTO document_checks (application_id, document_id, check_name, status, details, data) VALUES (?, ?, ?, ?, ?, ?)').run(id, documentId, check.check, check.status, check.details, JSON.stringify(check))
      }
      for (const field of fixture.extractedFields) {
        db.prepare('INSERT INTO extracted_fields (id, application_id, document_id, field_name, raw_value, normalized_value, confidence, source_location, review_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`${field.field_id}-${id}`, id, `${field.document_id}-${id}`, field.field_name, field.raw_value, field.normalized_value, field.confidence, JSON.stringify(field.source_location), field.review_required ? 1 : 0)
      }
      for (const document of fixture.documents) db.prepare('UPDATE documents SET status = ?, updated_at = ? WHERE id = ?').run(document.processing_status, now(), `${document.document_id}-${id}`)
      const events = [
        [3, 'extraction_needs_review', { reasonCodes: ['REQUIRED_LICENCE_FIELD_UNREADABLE'] }],
        [4, 'document_checks_need_review', { reasonCodes: ['REQUIRED_STATEMENT_PERIOD_MISSING', 'REQUIRED_LICENCE_FIELD_UNREADABLE'] }],
        [5, 'application_review_required', {}],
      ] as const
      for (const [sequence, type, details] of events) db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), id, sequence, type, now(), JSON.stringify(details))
      const application = parse<DemoApplication>(row.snapshot as string)
      application.status = 'needs_review'; application.version += 1
      application.documents = documentRows(id).map((d) => ({ id: d.id, type: d.type, issuer: d.issuer, periodStart: d.periodStart, periodEnd: d.periodEnd, status: d.status }))
      db.prepare("UPDATE applications SET status = 'needs_review', version = ?, snapshot = ?, updated_at = ? WHERE id = ?").run(application.version, JSON.stringify(application), now(), id)
      return application
    })()
  })

  app.get('/api/v1/applications/:id/document-review', { schema: { tags: ['documents'], params: Id, response: { 200: Type.Object({ status: Type.String(), checks: Type.Array(CheckSchema), blockers: Type.Array(CheckSchema), extractedFields: Type.Array(FieldSchema), auditEvents: Type.Array(AuditSchema) }) } } }, async (request) => {
    const { id } = request.params as { id: string }; const application = getApplicationRow(id)
    const checks = (db.prepare('SELECT document_id documentId, check_name [check], status, details, data FROM document_checks WHERE application_id = ? ORDER BY id').all(id) as any[]).map((r) => ({ ...r, data: parse(r.data) }))
    const extractedFields = (db.prepare('SELECT id, document_id documentId, field_name fieldName, raw_value rawValue, normalized_value normalizedValue, confidence, source_location sourceLocation, review_required reviewRequired FROM extracted_fields WHERE application_id = ? ORDER BY id').all(id) as any[]).map((r) => ({ ...r, sourceLocation: parse(r.sourceLocation), reviewRequired: Boolean(r.reviewRequired) }))
    const auditEvents = (db.prepare('SELECT id, sequence, type, at, details FROM application_audit_events WHERE application_id = ? ORDER BY sequence').all(id) as any[]).map((r) => ({ ...r, details: parse(r.details) }))
    return { status: application.status as string, checks, blockers: checks.filter((check) => check.status === 'needs_review'), extractedFields, auditEvents }
  })

  const CorrectionSchema = Type.Object({ id: Type.String(), applicationId: Type.String(), field: Type.Literal('loan.purposeDetail'), originalValue: Type.String(), currentValue: Type.String(), applicationVersion: Type.Integer(), createdAt: Type.String() })
  app.post('/api/v1/applications/:id/corrections', { schema: { tags: ['applications'], params: Id, body: Type.Object({ purposeDetail: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false }), response: { 201: CorrectionSchema } } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const purposeDetail = (request.body as { purposeDetail: string }).purposeDetail
    const correction = db.transaction(() => {
      const row = getApplicationRow(id)
      if (row.status !== 'ready_to_submit') throw new HttpProblem(409, 'Correction Not Allowed', 'Corrections are only allowed before submission')
      const application = parse<DemoApplication>(row.snapshot as string)
      const version = (row.version as number) + 1
      const body = { id: randomUUID(), applicationId: id, field: 'loan.purposeDetail' as const, originalValue: application.loan.purposeDetail, currentValue: purposeDetail, applicationVersion: version, createdAt: now() }
      application.loan.purposeDetail = purposeDetail; application.version = version
      db.prepare('UPDATE applications SET version = ?, snapshot = ?, updated_at = ? WHERE id = ?').run(version, JSON.stringify(application), body.createdAt, id)
      db.prepare('INSERT INTO application_corrections (id, application_id, field, original_value, current_value, application_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(body.id, id, body.field, body.originalValue, body.currentValue, body.applicationVersion, body.createdAt)
      return body
    })()
    return reply.code(201).send(correction)
  })
  app.get('/api/v1/applications/:id/corrections', { schema: { tags: ['applications'], params: Id, response: { 200: Type.Object({ corrections: Type.Array(CorrectionSchema) }) } } }, async (request) => {
    const { id } = request.params as { id: string }; getApplicationRow(id)
    const rows = db.prepare('SELECT id, application_id applicationId, field, original_value originalValue, current_value currentValue, application_version applicationVersion, created_at createdAt FROM application_corrections WHERE application_id = ? ORDER BY application_version').all(id)
    return { corrections: rows }
  })

  function replay(operation: string, key: string, resourceId: string, reply: FastifyReply): boolean {
    const record = db.prepare('SELECT * FROM idempotency_records WHERE operation = ? AND idempotency_key = ?').get(operation, key) as Record<string, unknown> | undefined
    if (!record) return false
    if (record.resource_id !== resourceId) throw new HttpProblem(409, 'Idempotency Conflict', 'The idempotency key was already used for another resource')
    reply.code(record.status_code as number).send(parse(record.response_body as string))
    return true
  }
  function record(operation: string, key: string, resourceId: string, status: number, body: unknown): void {
    db.prepare(`INSERT INTO idempotency_records
      (operation, idempotency_key, resource_id, status_code, response_body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(operation, key, resourceId, status, JSON.stringify(body), now())
  }

  app.post('/api/v1/applications/:id/submission', {
    schema: { tags: ['applications'], params: Id, body: ConfirmationBody, headers: IdempotencyHeaders, response: { 200: ApplicationSchema } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const key = request.headers['idempotency-key'] as string
    if (replay('submission', key, id, reply)) return
    const fixture = await loadScenario(getApplicationRow(id).scenario_id as ScenarioId)
    const result = db.transaction(() => {
      const row = getApplicationRow(id)
      const status = row.status as ApplicationStatus
      if (status === 'needs_review' || status === 'documents_required' || status === 'processing') throw new HttpProblem(409, 'Review Required — Outcome Withheld', `Application is ${status}; submission, assessment, and outcome are withheld until both document blockers are resolved`)
      if (status !== 'ready_to_submit') throw new HttpProblem(409, 'Invalid Application State', `Application is ${status}`)
      const scenarioId = row.scenario_id as ScenarioId
      const targetStatus = scenarioId === 'scenario-b' ? 'referred' as const : 'submitted' as const
      assertTransition(status, targetStatus)
      const application = { ...parse<DemoApplication>(row.snapshot as string), status: targetStatus, version: (row.version as number) + 1 }
      db.prepare('UPDATE applications SET status = ?, version = ?, snapshot = ?, updated_at = ? WHERE id = ?')
        .run(application.status, application.version, JSON.stringify(application), now(), id)
      if (scenarioId === 'scenario-a') {
        if (!fixture.offer) throw new Error('Scenario A offer fixture is missing')
        const offer: Offer = { ...fixture.offer, id: `${fixture.offer.id}-${id}`, applicationId: id, status: 'ready' }
        db.prepare('INSERT INTO offers (id, application_id, status, snapshot) VALUES (?, ?, ?, ?)').run(offer.id, id, offer.status, JSON.stringify(offer))
      }
      record('submission', key, id, 200, application)
      return application
    })()
    return reply.send(result)
  })

  app.get('/api/v1/applications/:id/outcome', { schema: { tags: ['applications'], params: Id, response: { 200: OutcomeSchema } } }, async (request) => {
    const row = getApplicationRow((request.params as { id: string }).id)
    if (row.scenario_id === 'scenario-c') throw new HttpProblem(409, 'Outcome Withheld — Review Required', 'No affordability, risk, pricing, or credit outcome exists while document review blockers remain')
    if (row.status === 'ready_to_submit') throw new HttpProblem(409, 'Outcome Not Available', 'Submit the application first')
    return parse<Outcome>(row.outcome_snapshot as string)
  })

  app.get('/api/v1/applications/:id/offer', { schema: { tags: ['offers'], params: Id, response: { 200: OfferSchema } } }, async (request) => {
    const id = (request.params as { id: string }).id
    const application = getApplicationRow(id)
    if (application.scenario_id === 'scenario-c') throw new HttpProblem(409, 'Offer Withheld — Review Required', 'No offer, acceptance, or funding is possible while document review blockers remain')
    if (application.status === 'referred') throw new HttpProblem(409, 'Application Referred', 'This application was referred and no offer was created')
    const row = db.prepare('SELECT snapshot FROM offers WHERE application_id = ?').get(id) as { snapshot: string } | undefined
    if (!row) throw new HttpProblem(409, 'Offer Not Available', 'Submit the application first')
    return parse<Offer>(row.snapshot)
  })

  app.post('/api/v1/offers/:id/acceptance', {
    schema: { tags: ['offers'], params: Id, headers: IdempotencyHeaders, response: { 200: OfferSchema } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const key = request.headers['idempotency-key'] as string
    if (replay('acceptance', key, id, reply)) return
    const accepted = db.transaction(() => {
      const row = getOfferRow(id)
      if (row.status !== 'ready') throw new HttpProblem(409, 'Invalid Offer State', `Offer is ${row.status}`)
      const offer = { ...parse<Offer>(row.snapshot as string), status: 'accepted' as const }
      const applicationRow = getApplicationRow(row.application_id as string)
      assertTransition(applicationRow.status as ApplicationStatus, 'offer_accepted')
      const application = { ...parse<DemoApplication>(applicationRow.snapshot as string), status: 'offer_accepted' as const, version: (applicationRow.version as number) + 1 }
      db.prepare('UPDATE offers SET status = ?, snapshot = ? WHERE id = ?').run('accepted', JSON.stringify(offer), id)
      db.prepare('UPDATE applications SET status = ?, version = ?, snapshot = ?, updated_at = ? WHERE id = ?')
        .run(application.status, application.version, JSON.stringify(application), now(), row.application_id)
      record('acceptance', key, id, 200, offer)
      return offer
    })()
    return reply.send(accepted)
  })

  app.post('/api/v1/offers/:id/disbursement', {
    schema: { tags: ['disbursements'], params: Id, headers: IdempotencyHeaders, response: { 201: DisbursementSchema } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const key = request.headers['idempotency-key'] as string
    if (replay('disbursement', key, id, reply)) return
    const disbursement = db.transaction(() => {
      const row = getOfferRow(id)
      if (row.status !== 'accepted') throw new HttpProblem(409, 'Invalid Offer State', row.status === 'funded' ? 'This offer has already been disbursed' : 'Accept the offer first')
      const offer = parse<Offer>(row.snapshot as string)
      const body: Disbursement = {
        id: randomUUID(), offerId: id, amount: offer.principal, status: 'completed',
        transferReference: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
        destinationAccountMasked: offer.destinationAccountMasked,
        simulationNotice: offer.simulationNotice,
      }
      const applicationRow = getApplicationRow(row.application_id as string)
      assertTransition(applicationRow.status as ApplicationStatus, 'funded')
      const application = { ...parse<DemoApplication>(applicationRow.snapshot as string), status: 'funded' as const, version: (applicationRow.version as number) + 1 }
      const fundedOffer = { ...offer, status: 'funded' as const }
      db.prepare('INSERT INTO disbursements (id, offer_id, status, snapshot, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(body.id, id, body.status, JSON.stringify(body), now())
      db.prepare('UPDATE offers SET status = ?, snapshot = ? WHERE id = ?').run('funded', JSON.stringify(fundedOffer), id)
      db.prepare('UPDATE applications SET status = ?, version = ?, snapshot = ?, updated_at = ? WHERE id = ?')
        .run(application.status, application.version, JSON.stringify(application), now(), row.application_id)
      record('disbursement', key, id, 201, body)
      return body
    })()
    return reply.code(201).send(disbursement)
  })

  app.get('/api/v1/disbursements/:id', { schema: { tags: ['disbursements'], params: Id, response: { 200: DisbursementSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    const row = db.prepare('SELECT snapshot FROM disbursements WHERE id = ?').get(id) as { snapshot: string } | undefined
    if (!row) throw new HttpProblem(404, 'Disbursement Not Found', `Disbursement ${id} was not found`)
    return parse<Disbursement>(row.snapshot)
  })

  app.addHook('onClose', async () => database.sqlite.close())
  await app.ready()
  return app
}
