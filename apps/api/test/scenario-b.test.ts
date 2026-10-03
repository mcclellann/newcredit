import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { buildApp } from '../src/app.js'
import { migrateDatabase } from '../src/db.js'
import { processPack } from './document-helpers.js'

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

describe('Scenario B API', () => {
  it('migrates an existing Scenario A database without losing applications or offers', () => {
    const sqlite = new Database(':memory:')
    const initialMigration = new URL('../drizzle/0000_scenario_a.sql', import.meta.url)
    sqlite.exec(`${readFileSync(initialMigration, 'utf8')}\nPRAGMA user_version = 1;`)
    sqlite.prepare(`INSERT INTO applications
      (id, scenario_id, status, version, snapshot, outcome_snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('app-a', 'scenario-a', 'submitted', 2, '{}', '{}', '2026-10-01', '2026-10-01')
    sqlite.prepare('INSERT INTO offers (id, application_id, status, snapshot) VALUES (?, ?, ?, ?)')
      .run('offer-a', 'app-a', 'ready', '{}')
    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec(`${readFileSync(new URL('../drizzle/0001_scenario_b.sql', import.meta.url), 'utf8')}
      ${readFileSync(new URL('../drizzle/0002_scenario_c_documents.sql', import.meta.url), 'utf8')}
      PRAGMA user_version = 3;`)
    sqlite.pragma('foreign_keys = ON')
    sqlite.prepare('INSERT INTO disbursements VALUES (?, ?, ?, ?, ?)').run('fund-a', 'offer-a', 'completed', '{}', '2026-10-01')
    sqlite.prepare('INSERT INTO application_corrections VALUES (?, ?, ?, ?, ?, ?, ?)').run('correction-a', 'app-a', 'loan.purposeDetail', 'old', 'new', 2, '2026-10-01')
    sqlite.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('document-a', 'app-a', 'sha256:test', 'application/pdf', 'test.pdf', 'test.pdf', 'payslip', 'issuer', null, null, 'processed', '2026-10-01', '2026-10-01')
    sqlite.prepare('INSERT INTO document_checks (application_id, document_id, check_name, status, details, data) VALUES (?, ?, ?, ?, ?, ?)').run('app-a', 'document-a', 'test', 'passed', 'ok', '{}')
    sqlite.prepare('INSERT INTO extracted_fields VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('field-a', 'app-a', 'document-a', 'income', '1', '1', '1.0', '{}', 0)
    sqlite.prepare('INSERT INTO application_audit_events VALUES (?, ?, ?, ?, ?, ?)').run('audit-a', 'app-a', 1, 'created', '2026-10-01', '{}')
    sqlite.prepare('INSERT INTO idempotency_records VALUES (?, ?, ?, ?, ?, ?)').run('submission', 'key-a', 'app-a', 200, '{}', '2026-10-01')

    migrateDatabase(sqlite)

    expect(sqlite.pragma('user_version', { simple: true })).toBe(4)
    expect(sqlite.prepare('SELECT scenario_id FROM applications WHERE id = ?').get('app-a')).toEqual({ scenario_id: 'scenario-a' })
    expect(sqlite.prepare('SELECT application_id FROM offers WHERE id = ?').get('offer-a')).toEqual({ application_id: 'app-a' })
    for (const [table, id] of [['disbursements', 'fund-a'], ['application_corrections', 'correction-a'], ['documents', 'document-a'], ['extracted_fields', 'field-a'], ['application_audit_events', 'audit-a']] as const) {
      expect(sqlite.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)).toEqual({ id })
    }
    expect(sqlite.prepare('SELECT id FROM document_checks').get()).toEqual({ id: 1 })
    expect(sqlite.prepare('SELECT resource_id FROM idempotency_records WHERE idempotency_key = ?').get('key-a')).toEqual({ resource_id: 'app-a' })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    sqlite.close()
  })

  it('persists correction and refers without creating an offer', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const login = await app.inject({ method: 'POST', url: '/api/v1/demo-sessions/login', payload: { scenarioId: 'scenario-b' } })
    expect(login.json()).toMatchObject({ customerName: 'Morgan Sample', simulated: true })
    const created = await app.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-b' } })
    expect(created.json()).toMatchObject({ status: 'documents_required', customer: { type: 'existing', existingCustomerReference: 'EXIST-SYN-B-204' }, financialPosition: { assetsTotal: { amountMinor: 500347 }, liabilitiesTotal: { amountMinor: 1934977 }, monthlyDebtRepayments: { amountMinor: 210000 } }, documents: [], review: null })
    expect(created.json().accounts).toEqual(expect.arrayContaining([expect.objectContaining({ ownership: 'joint', applicantShare: 0.4, accountMasked: '••••6813' })]))
    const id = created.json().id
    const processed = await processPack(app, id, 'scenario-b')
    expect(processed.json()).toMatchObject({ status: 'ready_to_submit', review: { documentChecksPassed: 14 } })
    const correction = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/corrections`, payload: { purposeDetail: 'Consolidate verified debts' } })
    expect(correction.json()).toMatchObject({ originalValue: 'Consolidate synthetic recurring liabilities', currentValue: 'Consolidate verified debts', applicationVersion: 4 })
    const history = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/corrections` })
    expect(history.json().corrections).toHaveLength(1)
    const submitted = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/submission`, headers: { 'idempotency-key': 'b-submit' }, payload: { confirmation: true } })
    expect(submitted.json()).toMatchObject({ status: 'referred', version: 5 })
    const outcome = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/outcome` })
    expect(outcome.json()).toMatchObject({ decision: 'referred', riskScore: 488, riskBand: 'moderate', monthlySurplus: { amountMinor: 48806 } })
    expect((await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/offer` })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/corrections`, payload: { purposeDetail: 'Too late' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/nonexistent/disbursement', headers: { 'idempotency-key': 'no-fund' } })).statusCode).toBe(404)
  })
})
