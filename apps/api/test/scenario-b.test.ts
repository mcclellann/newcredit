import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { buildApp } from '../src/app.js'
import { migrateDatabase } from '../src/db.js'

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

    migrateDatabase(sqlite)

    expect(sqlite.pragma('user_version', { simple: true })).toBe(2)
    expect(sqlite.prepare('SELECT scenario_id FROM applications WHERE id = ?').get('app-a')).toEqual({ scenario_id: 'scenario-a' })
    expect(sqlite.prepare('SELECT application_id FROM offers WHERE id = ?').get('offer-a')).toEqual({ application_id: 'app-a' })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    sqlite.close()
  })

  it('persists correction and refers without creating an offer', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const login = await app.inject({ method: 'POST', url: '/api/v1/demo-sessions/login', payload: { scenarioId: 'scenario-b' } })
    expect(login.json()).toMatchObject({ customerName: 'Morgan Sample', simulated: true })
    const created = await app.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-b' } })
    expect(created.json()).toMatchObject({ customer: { type: 'existing', existingCustomerReference: 'EXIST-SYN-B-204' }, financialPosition: { assetsTotal: { amountMinor: 500347 }, liabilitiesTotal: { amountMinor: 1934977 }, monthlyDebtRepayments: { amountMinor: 210000 } }, review: { documentChecksPassed: 14 } })
    expect(created.json().accounts).toEqual(expect.arrayContaining([expect.objectContaining({ ownership: 'joint', applicantShare: 0.4, accountMasked: '••••6813' })]))
    const id = created.json().id
    const correction = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/corrections`, payload: { purposeDetail: 'Consolidate verified debts' } })
    expect(correction.json()).toMatchObject({ originalValue: 'Consolidate synthetic recurring liabilities', currentValue: 'Consolidate verified debts', applicationVersion: 2 })
    const history = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/corrections` })
    expect(history.json().corrections).toHaveLength(1)
    const submitted = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/submission`, headers: { 'idempotency-key': 'b-submit' }, payload: { confirmation: true } })
    expect(submitted.json()).toMatchObject({ status: 'referred', version: 3 })
    const outcome = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/outcome` })
    expect(outcome.json()).toMatchObject({ decision: 'referred', riskScore: 488, riskBand: 'moderate', monthlySurplus: { amountMinor: 48806 } })
    expect((await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/offer` })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/corrections`, payload: { purposeDetail: 'Too late' } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/nonexistent/disbursement', headers: { 'idempotency-key': 'no-fund' } })).statusCode).toBe(404)
  })
})
