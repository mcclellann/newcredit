import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import { Type } from '@sinclair/typebox'
import { randomUUID } from 'node:crypto'
import type { ApplicationStatus, DemoApplication, Disbursement, Offer, Outcome } from '@newcredit/domain'
import { assertTransition } from '@newcredit/domain'
import { loadScenario, type ScenarioId } from '@newcredit/test-fixtures'
import { createDatabase, migrateDatabase, type ApiDatabase } from './db.js'

const Id = Type.Object({ id: Type.String({ minLength: 1 }) })
const ScenarioIdSchema = Type.Union([Type.Literal('scenario-a'), Type.Literal('scenario-b')])
const ScenarioBody = Type.Object({ scenarioId: ScenarioIdSchema }, { additionalProperties: false })
const ConfirmationBody = Type.Object({ confirmation: Type.Literal(true) }, { additionalProperties: false })
const IdempotencyHeaders = Type.Object({ 'idempotency-key': Type.String({ minLength: 1, maxLength: 255 }) })
const MoneySchema = Type.Object({ amountMinor: Type.Integer(), currency: Type.Literal('AUD') })
const DocumentSchema = Type.Object({
  id: Type.String(), type: Type.Union([Type.Literal('bank_statement'), Type.Literal('drivers_licence'), Type.Literal('payslip')]),
  issuer: Type.String(), periodStart: Type.Union([Type.String(), Type.Null()]), periodEnd: Type.Union([Type.String(), Type.Null()]),
  status: Type.Literal('processed'),
})
const ApplicationSchema = Type.Object({
  id: Type.String(), scenarioId: ScenarioIdSchema,
  status: Type.Union([Type.Literal('ready_to_submit'), Type.Literal('submitted'), Type.Literal('referred'), Type.Literal('offer_accepted'), Type.Literal('funded')]),
  version: Type.Integer(), fixedDemonstrationDate: Type.String(),
  customer: Type.Object({ type: Type.Union([Type.Literal('new'), Type.Literal('existing')]), name: Type.String(), dateOfBirth: Type.String(), email: Type.String(), phone: Type.String(), address: Type.String(), employer: Type.String(), existingCustomerReference: Type.Optional(Type.String()), profileConfirmation: Type.Optional(Type.Object({ confirmed: Type.Boolean(), at: Type.String(), fields: Type.Array(Type.String()) })) }),
  loan: Type.Object({ amount: MoneySchema, termYears: Type.Integer(), purpose: Type.String(), purposeDetail: Type.String() }),
  documents: Type.Array(DocumentSchema),
  accounts: Type.Array(Type.Object({ id: Type.String(), type: Type.String(), ownership: Type.Union([Type.Literal('sole'), Type.Literal('joint')]), applicantShare: Type.Number(), bsbMasked: Type.String(), accountMasked: Type.String(), active: Type.Boolean() })),
  financialPosition: Type.Object({ assetsTotal: MoneySchema, liabilitiesTotal: MoneySchema, monthlyDebtRepayments: MoneySchema }),
  review: Type.Object({ monthlyNetIncome: MoneySchema, assessedLivingExpenses: MoneySchema, monthlyHousing: MoneySchema, classifiedTransactionCount: Type.Integer(), documentChecksPassed: Type.Integer(), transactionCategories: Type.Array(Type.Object({ category: Type.String(), count: Type.Integer() })) }),
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
    const status = error instanceof HttpProblem ? error.status : validation ? 400 : 500
    const title = error instanceof HttpProblem ? error.title : validation ? 'Bad Request' : 'Internal Server Error'
    reply.status(status).type('application/problem+json').send({
      type: 'about:blank', title, status, detail: status === 500 ? 'An unexpected error occurred' : normalized.message,
      instance: request.url,
    })
  })

  app.get('/health', { schema: { tags: ['system'], response: { 200: Type.Object({ status: Type.Literal('ok') }) } } }, async () => ({ status: 'ok' }))
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  app.get('/api/v1/demo-scenarios', { schema: { tags: ['demo'], response: { 200: Type.Object({ scenarios: Type.Array(Type.Object({ id: ScenarioIdSchema, name: Type.String(), description: Type.String() })) }) } } }, async () => ({
    scenarios: [{ id: 'scenario-a' as const, name: 'Scenario A', description: 'Indicative approval and simulated funding' }, { id: 'scenario-b' as const, name: 'Scenario B', description: 'Existing customer referral' }],
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
    const application: DemoApplication = { id, status: 'ready_to_submit', version: 1, ...fixture.application }
    const outcome: Outcome = { applicationId: id, ...fixture.outcome }
    db.prepare(`INSERT INTO applications
      (id, scenario_id, status, version, snapshot, outcome_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, scenarioId, application.status, 1, JSON.stringify(application), JSON.stringify(outcome), timestamp, timestamp)
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

  app.get('/api/v1/applications/:id', { schema: { tags: ['applications'], params: Id, response: { 200: ApplicationSchema } } }, async (request) => {
    const { id } = request.params as { id: string }
    return parse<DemoApplication>(getApplicationRow(id).snapshot as string)
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
    if (row.status === 'ready_to_submit') throw new HttpProblem(409, 'Outcome Not Available', 'Submit the application first')
    return parse<Outcome>(row.outcome_snapshot as string)
  })

  app.get('/api/v1/applications/:id/offer', { schema: { tags: ['offers'], params: Id, response: { 200: OfferSchema } } }, async (request) => {
    const id = (request.params as { id: string }).id
    const application = getApplicationRow(id)
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
