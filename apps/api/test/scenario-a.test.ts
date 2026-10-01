import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

describe('Scenario A API', () => {
  it('executes the persisted lifecycle and enforces disbursement idempotency', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const created = await app.inject({ method: 'POST', url: '/api/v1/applications', payload: { scenarioId: 'scenario-a' } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ scenarioId: 'scenario-a', status: 'ready_to_submit', version: 1 })
    expect(Number.isInteger(created.json().loan.amount.amountMinor)).toBe(true)
    const applicationId = created.json().id as string

    const missingKey = await app.inject({ method: 'POST', url: `/api/v1/applications/${applicationId}/submission`, payload: { confirmation: true } })
    expect(missingKey.statusCode).toBe(400)
    expect(missingKey.headers['content-type']).toContain('application/problem+json')

    const submitted = await app.inject({
      method: 'POST', url: `/api/v1/applications/${applicationId}/submission`,
      headers: { 'idempotency-key': 'submit-1' }, payload: { confirmation: true },
    })
    expect(submitted.json()).toMatchObject({ status: 'submitted', version: 2 })
    const offerResponse = await app.inject({ method: 'GET', url: `/api/v1/applications/${applicationId}/offer` })
    const offerId = offerResponse.json().id as string

    const accepted = await app.inject({
      method: 'POST', url: `/api/v1/offers/${offerId}/acceptance`,
      headers: { 'idempotency-key': 'accept-1' },
    })
    expect(accepted.json().status).toBe('accepted')

    const first = await app.inject({ method: 'POST', url: `/api/v1/offers/${offerId}/disbursement`, headers: { 'idempotency-key': 'fund-1' } })
    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ offerId, status: 'completed' })

    const replay = await app.inject({ method: 'POST', url: `/api/v1/offers/${offerId}/disbursement`, headers: { 'idempotency-key': 'fund-1' } })
    expect(replay.statusCode).toBe(201)
    expect(replay.json()).toEqual(first.json())

    const duplicate = await app.inject({ method: 'POST', url: `/api/v1/offers/${offerId}/disbursement`, headers: { 'idempotency-key': 'fund-2' } })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.headers['content-type']).toContain('application/problem+json')

    const fetched = await app.inject({ method: 'GET', url: `/api/v1/disbursements/${first.json().id}` })
    expect(fetched.json()).toEqual(first.json())
    const application = await app.inject({ method: 'GET', url: `/api/v1/applications/${applicationId}` })
    expect(application.json()).toMatchObject({ status: 'funded', version: 4 })
  })

  it('publishes all explicit routes in OpenAPI', async () => {
    app = await buildApp({ databaseUrl: ':memory:', migrate: true })
    const response = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(response.statusCode).toBe(200)
    expect(response.json().paths).toHaveProperty('/api/v1/offers/{id}/disbursement')
    expect(response.json().paths).toHaveProperty('/api/v1/applications/{id}/outcome')
  })
})
