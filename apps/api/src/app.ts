import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import { Type } from '@sinclair/typebox'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { zipSync } from 'fflate'
import type { ApplicationStatus, DemoApplication, Disbursement, Offer, Outcome } from '@newcredit/domain'
import { assertTransition, classifyTransaction } from '@newcredit/domain'
import { loadScenarioDocumentData, type ScenarioId } from '@newcredit/test-fixtures'
import { createDatabase, migrateDatabase, type ApiDatabase } from './db.js'
import { extractDocument, type DocumentType, type ParsedDocument } from './document-extraction.js'
import { assembleEvidence, type Evidence } from './application-evidence.js'

const Id = Type.Object({ id: Type.String({ minLength: 1 }) })
const ScenarioIdSchema = Type.Union([Type.Literal('scenario-a'), Type.Literal('scenario-b'), Type.Literal('scenario-c'), Type.Literal('scenario-h')])
const ConfirmationBody = Type.Object({ confirmation: Type.Literal(true) }, { additionalProperties: false })
const IdempotencyHeaders = Type.Object({ 'idempotency-key': Type.String({ minLength: 1, maxLength: 255 }) })
const MoneySchema = Type.Object({ amountMinor: Type.Integer(), currency: Type.Literal('AUD') })
const DocumentSchema = Type.Object({
  id: Type.String(), type: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]),
  issuer: Type.String(), periodStart: Type.Union([Type.String(), Type.Null()]), periodEnd: Type.Union([Type.String(), Type.Null()]),
  status: Type.Union([Type.Literal('uploaded'), Type.Literal('processing'), Type.Literal('processed'), Type.Literal('needs_review')]),
})
const NonnegativeMoney = Type.Integer({ minimum: 0, maximum: 1_000_000_000 })
const DeclarationsSchema = Type.Object({
  adults: Type.Union([Type.Literal(1), Type.Literal(2)]), dependants: Type.Integer({ minimum: 0, maximum: 4 }), inWorkforce: Type.Boolean(),
  declaredLivingMinor: NonnegativeMoney, declaredHousingMinor: NonnegativeMoney, declaredDebtRepaymentsMinor: NonnegativeMoney,
  otherCommitmentsMinor: NonnegativeMoney, assetsMinor: NonnegativeMoney, liabilitiesMinor: NonnegativeMoney,
  allAccountsConfirmed: Type.Boolean(), incomeContinuing: Type.Boolean(), foreseeableChanges: Type.String({ maxLength: 1000 }), confirmed: Type.Boolean(),
  classifications: Type.Record(Type.String({ maxLength: 100 }), Type.String({ maxLength: 40 })),
}, { additionalProperties: false })
const DetailsSchema = Type.Object({
  loan: Type.Object({ amountMinor: Type.Integer({ minimum: 500000, maximum: 10000000 }), termYears: Type.Integer({ minimum: 1, maximum: 5 }), purposeDetail: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false }),
  customer: Type.Object({ email: Type.String({ minLength: 3, maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }), phone: Type.String({ minLength: 6, maxLength: 30 }) }, { additionalProperties: false }),
  declarations: DeclarationsSchema,
}, { additionalProperties: false })
const ApplicationSchema = Type.Object({
  id: Type.String(), scenarioId: Type.Union([ScenarioIdSchema, Type.Literal('document-driven')]),
  status: Type.Union([Type.Literal('documents_required'), Type.Literal('processing'), Type.Literal('needs_review'), Type.Literal('ready_to_submit'), Type.Literal('submitted'), Type.Literal('referred'), Type.Literal('not_approved'), Type.Literal('offer_accepted'), Type.Literal('funded')]),
  version: Type.Integer(), fixedDemonstrationDate: Type.String(),
  customer: Type.Object({ type: Type.Union([Type.Literal('new'), Type.Literal('existing')]), name: Type.String(), dateOfBirth: Type.String(), email: Type.String(), phone: Type.String(), address: Type.String(), employer: Type.String(), existingCustomerReference: Type.Optional(Type.String()), profileConfirmation: Type.Optional(Type.Object({ confirmed: Type.Boolean(), at: Type.String(), fields: Type.Array(Type.String()) })) }),
  loan: Type.Object({ amount: MoneySchema, termYears: Type.Integer(), purpose: Type.String(), purposeDetail: Type.String() }),
  documents: Type.Array(DocumentSchema),
  accounts: Type.Array(Type.Object({ id: Type.String(), type: Type.String(), ownership: Type.Union([Type.Literal('sole'), Type.Literal('joint')]), applicantShare: Type.Number(), bsbMasked: Type.String(), accountMasked: Type.String(), active: Type.Boolean() })),
  financialPosition: Type.Object({ assetsTotal: MoneySchema, liabilitiesTotal: MoneySchema, monthlyDebtRepayments: MoneySchema }),
  declarations: Type.Optional(DeclarationsSchema),
  transactions: Type.Optional(Type.Array(Type.Object({ id: Type.String(), documentId: Type.String(), date: Type.String(), description: Type.String(), amountMinor: Type.Integer(), balanceMinor: Type.Integer(), account: Type.String(), category: Type.String() }))),
  review: Type.Union([Type.Object({ monthlyNetIncome: MoneySchema, assessedLivingExpenses: MoneySchema, monthlyHousing: MoneySchema, classifiedTransactionCount: Type.Integer(), documentChecksPassed: Type.Integer(), transactionCategories: Type.Array(Type.Object({ category: Type.String(), count: Type.Integer() })) }), Type.Null()]),
})
const OutcomeSchema = Type.Object({
  applicationId: Type.String(), decision: Type.Union([Type.Literal('indicatively_approved'), Type.Literal('referred'), Type.Literal('not_approved')]), riskScore: Type.Integer({ minimum: 1, maximum: 1000 }), riskBand: Type.Union([Type.Literal('very_low'), Type.Literal('low'), Type.Literal('moderate'), Type.Literal('elevated'), Type.Literal('high'), Type.Literal('severe')]),
  affordability: Type.Union([Type.Literal('affordable'), Type.Literal('unaffordable')]), monthlySurplus: MoneySchema, reasons: Type.Array(Type.String()), factors: Type.Array(Type.Object({ factor: Type.String(), signal: Type.String(), riskValue: Type.Integer() })), illustrativeNotOffer: Type.Literal(true),
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
const DocumentRequirementsSchema = Type.Object({
  expectedCount: Type.Integer(), uploadedCount: Type.Integer(), remainingCount: Type.Integer(),
  requirements: Type.Array(Type.Object({ type: Type.String(), count: Type.Integer(), text: Type.String(), uploadedCount: Type.Integer(), processedCount: Type.Integer() })),
  expectedDocuments: Type.Array(Type.Object({ filename: Type.String(), type: Type.String() })),
})

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
  await app.register(swagger, { openapi: { openapi: '3.1.0', info: { title: 'NewCredit Demo API', version: '2.0.0' } } })

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
    scenarios: ['a', 'b', 'c', 'h'].map(letter => ({ id: `scenario-${letter}` as ScenarioId, name: `Sample pack ${letter.toUpperCase()}`, description: 'Synthetic input documents only; uploaded evidence and declarations determine the outcome.' })),
  }))

  app.post('/api/v1/demo-sessions', { schema: { tags: ['demo'], response: { 201: Type.Object({ id: Type.String(), createdAt: Type.String() }) } } }, async (_request, reply) => {
    const session = { id: randomUUID(), createdAt: now() }
    db.prepare('INSERT INTO demo_sessions (id, created_at) VALUES (?, ?)').run(session.id, session.createdAt)
    return reply.code(201).send(session)
  })

  app.post('/api/v1/demo-sessions/login', { schema: { tags: ['demo'], body: Type.Object({}, { additionalProperties: false }), response: { 200: Type.Object({ customerReference: Type.String(), customerName: Type.String(), simulated: Type.Literal(true), notice: Type.String() }) } } }, async () => {
    return { customerReference: 'DEMO-EXISTING', customerName: 'Demo customer', simulated: true as const, notice: 'Demonstration login only; this is not production authentication or verified identity. Upload identity evidence to populate the application.' }
  })

  app.post('/api/v1/applications', { schema: { tags: ['applications'], body: Type.Object({ customerType: Type.Union([Type.Literal('new'), Type.Literal('existing')]) }, { additionalProperties: false }), response: { 201: ApplicationSchema } } }, async (request, reply) => {
    const { customerType } = request.body as { customerType: 'new' | 'existing' }
    const id = randomUUID()
    const timestamp = now()
    const zero = { amountMinor: 0, currency: 'AUD' as const }
    const application: DemoApplication = {
      id, scenarioId: 'document-driven', status: 'documents_required', version: 1, fixedDemonstrationDate: '2026-10-01',
      customer: { type: customerType, name: '', dateOfBirth: '', email: '', phone: '', address: '', employer: '', ...(customerType === 'existing' ? { existingCustomerReference: 'DEMO-EXISTING' } : {}) },
      loan: { amount: { amountMinor: 2000000, currency: 'AUD' }, termYears: 3, purpose: 'personal', purposeDetail: '' },
      documents: [], accounts: [], financialPosition: { assetsTotal: zero, liabilitiesTotal: zero, monthlyDebtRepayments: zero }, review: null, transactions: [],
      declarations: { adults: 1, dependants: 0, inWorkforce: true, declaredLivingMinor: 0, declaredHousingMinor: 0, declaredDebtRepaymentsMinor: 0, otherCommitmentsMinor: 0, assetsMinor: 0, liabilitiesMinor: 0, allAccountsConfirmed: false, incomeContinuing: false, foreseeableChanges: '', confirmed: false, classifications: {} },
    }
    db.prepare(`INSERT INTO applications
      (id, scenario_id, status, version, snapshot, outcome_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, 'document-driven', application.status, 1, JSON.stringify(application), null, timestamp, timestamp)
    db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, 1, ?, ?, ?)').run(randomUUID(), id, 'synthetic_consent_recorded', timestamp, '{}')
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
  function editable(id: string) {
    const row = getApplicationRow(id)
    if (row.scenario_id !== 'document-driven') throw new HttpProblem(409, 'Legacy Demonstration', 'Start a new document-driven application; legacy fixture assessments are read-only.')
    if (!['documents_required', 'needs_review', 'ready_to_submit'].includes(row.status as string)) throw new HttpProblem(409, 'Application Locked', 'Submitted applications cannot be changed.')
    return row
  }
  function evidence(id: string): Evidence[] {
    return (db.prepare('SELECT document_id id, parsed FROM document_extractions JOIN documents ON documents.id = document_id WHERE application_id = ? ORDER BY created_at, document_id').all(id) as { id: string; parsed: string }[]).map(r => ({ id: r.id, parsed: parse<ParsedDocument>(r.parsed) }))
  }
  function audit(id: string, type: string, details: unknown) {
    const { sequence } = db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 sequence FROM application_audit_events WHERE application_id = ?').get(id) as { sequence: number }
    db.prepare('INSERT INTO application_audit_events (id, application_id, sequence, type, at, details) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), id, sequence, type, now(), JSON.stringify(details))
  }
  const hasSavedDetails = (id: string) => Boolean(db.prepare("SELECT 1 FROM application_audit_events WHERE application_id = ? AND type = 'applicant_details_confirmed' LIMIT 1").get(id))
  function rebuild(application: DemoApplication) {
    application.documents = documentRows(application.id).map(d => ({ id: d.id, type: d.type, issuer: d.issuer, periodStart: d.periodStart, periodEnd: d.periodEnd, status: d.status }))
    const result = assembleEvidence(application, evidence(application.id), !hasSavedDetails(application.id))
    if (application.documents.some(d => d.status === 'uploaded')) { result.issues.push('Process all uploaded documents before submission.'); application.status = 'needs_review' }
    application.version += 1
    db.prepare('DELETE FROM document_checks WHERE application_id = ? AND document_id IS NULL').run(application.id)
    for (const issue of result.issues) db.prepare('INSERT INTO document_checks (application_id, document_id, check_name, status, details, data) VALUES (?, NULL, ?, ?, ?, ?)').run(application.id, 'evidence_review', 'needs_review', issue, '{}')
    db.prepare('UPDATE applications SET status = ?, version = ?, snapshot = ?, outcome_snapshot = NULL, updated_at = ? WHERE id = ?').run(application.status, application.version, JSON.stringify(application), now(), application.id)
    return result
  }
  async function persistDocument(applicationId: string, bytes: Buffer, supplied: { filename: string; mimetype: string }, documentType: DocumentType) {
    editable(applicationId)
    if (bytes.length > 20 * 1024 * 1024) throw new HttpProblem(413, 'Document Too Large', 'Documents must not exceed 20 MiB')
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(supplied.mimetype)) throw new HttpProblem(415, 'Unsupported Document Type', 'Only PDF, JPEG, and PNG documents are accepted')
    const validMagic = supplied.mimetype === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : supplied.mimetype === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 0xff && bytes[1] === 0xd8
    if (!validMagic) throw new HttpProblem(415, 'Invalid Document Content', 'Document content does not match its declared media type')
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const existing = db.prepare('SELECT id, document_type FROM documents WHERE application_id = ? AND source_hash = ?').get(applicationId, hash) as { id: string; document_type: string } | undefined
    if (existing) {
      if (existing.document_type !== documentType) throw new HttpProblem(422, 'Document Type Mismatch', 'This file was already uploaded in a different step; remove it before changing its type.')
      return documentRows(applicationId).find(document => document.id === existing.id)
    }
    const extension = supplied.mimetype === 'application/pdf' ? '.pdf' : supplied.mimetype === 'image/png' ? '.png' : '.jpg'
    const storageKey = `${applicationId}-${hash.slice(7)}${extension}`
    const originalName = basename(supplied.filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || `document${extension}`
    await mkdir(storageRoot, { recursive: true })
    try { await writeFile(join(storageRoot, storageKey), bytes, { flag: 'wx', mode: 0o600 }) } catch (error: any) { if (error?.code !== 'EEXIST') throw error }
    const timestamp = now()
    const id = randomUUID()
    // The file write is asynchronous: recheck state before committing metadata.
    editable(applicationId)
    db.prepare(`INSERT INTO documents (id, application_id, source_hash, media_type, storage_key, original_name, document_type, issuer, period_start, period_end, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, 'uploaded', ?, ?)`).run(id, applicationId, hash, supplied.mimetype, storageKey, originalName, documentType, timestamp, timestamp)
    return documentRows(applicationId).find((document) => document.id === id)
  }

  app.get('/api/v1/applications/:id', { schema: { tags: ['applications'], params: Id, response: { 200: ApplicationSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    const row = getApplicationRow(id)
    const application = parse<DemoApplication>(row.snapshot as string)
    // Also fill existing unsaved drafts created before pre-population was added,
    // without writing on GET or changing their stored lifecycle/version.
    if (row.scenario_id === 'document-driven' && ['documents_required', 'needs_review', 'ready_to_submit'].includes(row.status as string) && !hasSavedDetails(id)) {
      const status = application.status
      assembleEvidence(application, evidence(id), true)
      application.status = status
    }
    return application
  })

  app.get('/api/v1/applications/:id/documents', { schema: { tags: ['documents'], params: Id, response: { 200: Type.Object({ documents: Type.Array(StoredDocumentSchema) }) } } }, async (request) => {
    const { id } = request.params as { id: string }; getApplicationRow(id)
    return { documents: documentRows(id) }
  })

  app.get('/api/v1/applications/:id/document-requirements', { schema: { tags: ['documents'], params: Id, response: { 200: DocumentRequirementsSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    getApplicationRow(id)
    const stored = documentRows(id)
    const types = ['drivers_licence', 'payslip', 'bank_statement']
    return {
      expectedCount: 3, uploadedCount: stored.length, remainingCount: types.filter(type => !stored.some(d => d.type === type)).length,
      requirements: types.map(type => ({
        type, count: 1, text: type === 'drivers_licence' ? 'Identity text PDF. Images and scans require review.' : type === 'payslip' ? 'Two months of payslips (at least eight weeks of pay periods); any number of files.' : 'Three full calendar months of statements for every account with transactions; any number of files.',
        uploadedCount: stored.filter((document) => document.type === type).length,
        processedCount: stored.filter((document) => document.type === type && ['processed', 'needs_review'].includes(document.status)).length,
      })),
      expectedDocuments: [],
    }
  })

  app.get('/api/v1/applications/:id/documents/demo-pack', { schema: { tags: ['demo', 'documents'], params: Id, querystring: Type.Object({ pack: ScenarioIdSchema }), produces: ['application/zip'], response: { 200: Type.String({ format: 'binary' }) } } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    getApplicationRow(id)
    const { pack } = request.query as { pack: ScenarioId }
    const fixture = await loadScenarioDocumentData(pack)
    const files = Object.fromEntries(fixture.documents.map((document: any) => [basename(document.file), new Uint8Array(document.bytes)]))
    return reply.type('application/zip').header('content-disposition', `attachment; filename="${pack}-sample-documents.zip"`).send(Buffer.from(zipSync(files)))
  })

  app.post('/api/v1/applications/:id/documents', { schema: { tags: ['documents'], params: Id, querystring: Type.Object({ documentType: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]) }), response: { 201: StoredDocumentSchema, 200: StoredDocumentSchema } } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    editable(id)
    const part = await request.file()
    if (!part) throw new HttpProblem(400, 'Document Required', 'A multipart file is required')
    const bytes = await part.toBuffer()
    const hash = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const duplicate = db.prepare('SELECT 1 FROM documents WHERE application_id = ? AND source_hash = ?').get(id, hash)
    const result = await persistDocument(id, bytes, { filename: part.filename, mimetype: part.mimetype }, (request.query as { documentType: DocumentType }).documentType)
    if (!duplicate) db.transaction(() => {
      const application = parse<DemoApplication>(editable(id).snapshot as string)
      application.declarations!.confirmed = false
      rebuild(application)
      audit(id, 'document_uploaded', { documentId: result.id, sourceHash: hash })
    })()
    return reply.code(duplicate ? 200 : 201).send(result)
  })

  app.post('/api/v1/applications/:id/document-processing', { schema: { tags: ['documents'], params: Id, querystring: Type.Object({ documentType: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]) }), response: { 200: ApplicationSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    const { documentType } = request.query as { documentType: 'bank_statement' | 'drivers_licence' | 'payslip' }
    editable(id)
    const documents = documentRows(id)
    const stageOrder = ['drivers_licence', 'payslip', 'bank_statement']
    for (const type of stageOrder.slice(0, stageOrder.indexOf(documentType))) if (!documents.some(d => d.type === type && ['processed', 'needs_review'].includes(d.status))) throw new HttpProblem(409, 'Previous Document Stage Incomplete', `Process ${type} evidence first.`)
    const stage = documents.filter(d => d.type === documentType)
    if (!stage.length) throw new HttpProblem(409, 'Documents Required', 'Upload at least one document for this step.')
    const parsedDocuments = await Promise.all(stage.filter(d => d.status === 'uploaded').map(async document => {
      const stored = db.prepare('SELECT storage_key FROM documents WHERE id = ?').get(document.id) as { storage_key: string }
      return { id: document.id as string, parsed: await extractDocument(await readFile(join(storageRoot, stored.storage_key)), document.mediaType, documentType) }
    }))
    return db.transaction(() => {
      const current = editable(id)
      for (const { id: documentId, parsed } of parsedDocuments) {
        if (!documentRows(id).some(d => d.id === documentId)) throw new HttpProblem(409, 'Document Changed', 'Document was removed while processing; retry this step.')
        db.prepare('INSERT OR REPLACE INTO document_extractions (document_id, parsed) VALUES (?, ?)').run(documentId, JSON.stringify(parsed))
        db.prepare('DELETE FROM document_checks WHERE document_id = ?').run(documentId)
        db.prepare('DELETE FROM extracted_fields WHERE document_id = ?').run(documentId)
        db.prepare('INSERT INTO document_checks (application_id, document_id, check_name, status, details, data) VALUES (?, ?, ?, ?, ?, ?)').run(id, documentId, 'text_and_arithmetic', parsed.issues.length ? 'needs_review' : 'passed', parsed.issues.join(' ') || 'Supported text fields and arithmetic extracted. Authenticity is not established.', '{}')
        for (const [fieldName, value] of Object.entries(parsed.fields)) db.prepare('INSERT INTO extracted_fields (id, application_id, document_id, field_name, raw_value, normalized_value, confidence, source_location, review_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`${documentId}:${fieldName}`, id, documentId, fieldName, value, value, '1', JSON.stringify({ method: 'labelled-text-pdf-v1', confidenceMeaning: 'Exact text match, not authenticity or calibrated OCR confidence' }), 0)
        db.prepare('UPDATE documents SET issuer = ?, period_start = ?, period_end = ?, status = ?, updated_at = ? WHERE id = ?').run(parsed.issuer, parsed.periodStart, parsed.periodEnd, parsed.issues.length ? 'needs_review' : 'processed', now(), documentId)
      }
      const result = rebuild(parse<DemoApplication>(current.snapshot as string))
      audit(id, 'document_stage_processed', { documentType, count: parsedDocuments.length })
      return result.application
    })()
  })

  app.delete('/api/v1/applications/:id/documents/:documentId', { schema: { tags: ['documents'], params: Type.Object({ id: Type.String(), documentId: Type.String() }), response: { 200: ApplicationSchema } } }, async (request) => db.transaction(() => {
    const { id, documentId } = request.params as { id: string; documentId: string }
    const row = editable(id)
    if (!documentRows(id).some(d => d.id === documentId)) throw new HttpProblem(404, 'Document Not Found', 'Document does not belong to this application.')
    db.prepare('DELETE FROM documents WHERE id = ? AND application_id = ?').run(documentId, id)
    const application = parse<DemoApplication>(row.snapshot as string)
    application.declarations!.confirmed = false
    application.declarations!.classifications = Object.fromEntries(Object.entries(application.declarations!.classifications).filter(([key]) => !key.startsWith(`${documentId}:`)))
    const result = rebuild(application)
    audit(id, 'document_removed', { documentId })
    return result.application
  })())

  app.put('/api/v1/applications/:id/details', { schema: { tags: ['applications'], params: Id, body: DetailsSchema, response: { 200: ApplicationSchema } } }, async (request) => db.transaction(() => {
    const { id } = request.params as { id: string }
    const row = editable(id)
    const application = parse<DemoApplication>(row.snapshot as string)
    const body = request.body as { loan: { amountMinor: number; termYears: number; purposeDetail: string }; customer: { email: string; phone: string }; declarations: NonNullable<DemoApplication['declarations']> }
    const originals = evidence(id).flatMap(r => r.parsed.transactions.map((tx, index) => ({ ...tx, id: `${r.id}:${index}` })))
    for (const [transactionId, category] of Object.entries(body.declarations.classifications)) {
      const transaction = originals.find(t => t.id === transactionId)
      if (!transaction || !['unclassified_credit', 'unclassified_debit', 'cash'].includes(classifyTransaction(transaction))) throw new HttpProblem(422, 'Invalid Classification', 'Only unknown or cash transactions in this application may be confirmed.')
      try { classifyTransaction({ ...transaction, confirmedCategory: category }) } catch { throw new HttpProblem(422, 'Invalid Classification', 'Category is not valid for this transaction direction.') }
    }
    const before = { loan: application.loan, customer: { email: application.customer.email, phone: application.customer.phone }, declarations: application.declarations }
    application.loan = { ...application.loan, amount: { amountMinor: body.loan.amountMinor, currency: 'AUD' }, termYears: body.loan.termYears, purposeDetail: body.loan.purposeDetail.trim() }
    application.customer = { ...application.customer, ...body.customer }
    application.declarations = body.declarations
    audit(id, 'applicant_details_confirmed', { before, after: body })
    const result = rebuild(application)
    return result.application
  })())

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
      const row = editable(id)
      const application = parse<DemoApplication>(row.snapshot as string)
      const version = (row.version as number) + 1
      const body = { id: randomUUID(), applicationId: id, field: 'loan.purposeDetail' as const, originalValue: application.loan.purposeDetail, currentValue: purposeDetail, applicationVersion: version, createdAt: now() }
      application.loan.purposeDetail = purposeDetail; application.version = version
      application.declarations!.confirmed = false
      application.version -= 1
      rebuild(application)
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
    const result = db.transaction(() => {
      const row = editable(id)
      const status = row.status as ApplicationStatus
      const application = parse<DemoApplication>(row.snapshot as string)
      const computed = assembleEvidence(application, evidence(id))
      if (status !== 'ready_to_submit' || computed.issues.length || !computed.assessment || application.documents.some(d => d.status === 'uploaded')) throw new HttpProblem(409, 'Review Required — Outcome Withheld', 'Resolve all evidence issues, classifications and declarations before submission.')
      const { outcome, pricing } = computed.assessment
      const targetStatus: ApplicationStatus = outcome.decision === 'indicatively_approved' ? 'submitted' : outcome.decision === 'referred' ? 'referred' : 'not_approved'
      assertTransition(status, targetStatus)
      application.status = targetStatus; application.version += 1
      db.prepare('UPDATE applications SET status = ?, version = ?, snapshot = ?, outcome_snapshot = ?, updated_at = ? WHERE id = ?')
        .run(application.status, application.version, JSON.stringify(application), JSON.stringify(outcome), now(), id)
      if (outcome.decision === 'indicatively_approved') {
        const offer: Offer = { id: randomUUID(), applicationId: id, principal: application.loan.amount, termYears: application.loan.termYears, ...pricing, monthlyFee: { amountMinor: 1500, currency: 'AUD' }, status: 'ready', destinationAccountMasked: application.accounts[0]!.accountMasked, simulationNotice: 'Simulation only. No real loan is created and no money is transferred.' }
        db.prepare('INSERT INTO offers (id, application_id, status, snapshot) VALUES (?, ?, ?, ?)').run(offer.id, id, offer.status, JSON.stringify(offer))
      }
      audit(id, 'document_driven_assessment', { decision: outcome.decision, score: outcome.riskScore, engine: 'transaction-risk-v1', benchmark: 'dleb-2026q1-v1' })
      record('submission', key, id, 200, application)
      return application
    })()
    return reply.send(result)
  })

  app.get('/api/v1/applications/:id/outcome', { schema: { tags: ['applications'], params: Id, response: { 200: OutcomeSchema } } }, async (request) => {
    const row = getApplicationRow((request.params as { id: string }).id)
    if (!row.outcome_snapshot || ['documents_required', 'processing', 'needs_review', 'ready_to_submit'].includes(row.status as string)) throw new HttpProblem(409, 'Outcome Not Available', 'Submit a complete application first')
    return parse<Outcome>(row.outcome_snapshot as string)
  })

  app.get('/api/v1/applications/:id/offer', { schema: { tags: ['offers'], params: Id, response: { 200: OfferSchema } } }, async (request) => {
    const id = (request.params as { id: string }).id
    const application = getApplicationRow(id)
    if (['documents_required', 'processing', 'needs_review', 'ready_to_submit'].includes(application.status as string)) throw new HttpProblem(409, 'Offer Not Available', 'Submit the application first')
    if (application.status === 'referred') throw new HttpProblem(409, 'Application Referred', 'This application was referred and no offer was created')
    if (application.status === 'not_approved') throw new HttpProblem(409, 'Application Not Approved', 'This application was not approved and no offer, acceptance, or funding is available')
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
