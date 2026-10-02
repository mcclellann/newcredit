import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

describe('Scenario H API', () => {
  it('loads Taylor, records a complete review, and idempotently declines without an offer', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const login = await app.inject({ method: 'POST', url: '/api/v1/demo-sessions/login', payload: { scenarioId: 'scenario-h' } })
    expect(login.json()).toMatchObject({ scenarioId: 'scenario-h', customerReference: 'EXIST-SYN-H-808', customerName: 'Taylor Example', simulated: true })

    const created = await app.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-h' } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      scenarioId: 'scenario-h', status: 'ready_to_submit', version: 1,
      financialPosition: { assetsTotal: { amountMinor: 0 }, liabilitiesTotal: { amountMinor: 3328419 }, monthlyDebtRepayments: { amountMinor: 220000 } },
      review: { documentChecksPassed: 8, classifiedTransactionCount: 29 },
    })
    const id = created.json().id as string
    const first = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/submission`, headers: { 'idempotency-key': 'h-submit' }, payload: { confirmation: true } })
    expect(first.json()).toMatchObject({ status: 'not_approved', version: 2 })
    const replay = await app.inject({ method: 'POST', url: `/api/v1/applications/${id}/submission`, headers: { 'idempotency-key': 'h-submit' }, payload: { confirmation: true } })
    expect(replay.json()).toEqual(first.json())

    const outcome = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/outcome` })
    expect(outcome.json()).toEqual(expect.objectContaining({
      applicationId: id, decision: 'not_approved', riskScore: 750, riskBand: 'high', affordability: 'unaffordable',
      monthlySurplus: { amountMinor: -118493, currency: 'AUD' },
      reasons: ['UNAFFORDABLE_NEGATIVE_SURPLUS', 'HIGH_RISK_SCORE', 'HIGH_EXISTING_DEBT_BURDEN', 'SUSTAINED_NEGATIVE_EXTERNAL_CASH_FLOW', 'PAYMENT_STRESS_OBSERVED'],
    }))
    expect(outcome.json().factors).toHaveLength(7)
    const offer = await app.inject({ method: 'GET', url: `/api/v1/applications/${id}/offer` })
    expect(offer.statusCode).toBe(409)
    expect(offer.headers['content-type']).toContain('application/problem+json')
    expect(offer.json()).toMatchObject({ title: 'Application Not Approved' })
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/nonexistent/acceptance', headers: { 'idempotency-key': 'h-accept' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/v1/offers/nonexistent/disbursement', headers: { 'idempotency-key': 'h-fund' } })).statusCode).toBe(404)
  })
})
