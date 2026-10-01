import type { Application, Disbursement, Offer, Outcome } from './types'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.'
    try { message = (await response.json() as { detail?: string }).detail || message } catch { /* use safe message */ }
    throw new ApiError(message, response.status)
  }
  return response.json() as Promise<T>
}

const key = () => crypto.randomUUID()
export const api = {
  scenarios: () => request<unknown>('/demo-scenarios'),
  createSession: () => request<unknown>('/demo-sessions', { method: 'POST', body: JSON.stringify({ scenarioId: 'scenario-a' }) }),
  createApplication: () => request<Application>('/applications', { method: 'POST', body: JSON.stringify({ scenarioId: 'scenario-a' }) }),
  application: (id: string) => request<Application>(`/applications/${id}`),
  submit: (id: string) => request<Application>(`/applications/${id}/submission`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
  outcome: (id: string) => request<Outcome>(`/applications/${id}/outcome`),
  offer: (id: string) => request<Offer>(`/applications/${id}/offer`),
  accept: (id: string) => request<Offer>(`/offers/${id}/acceptance`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
  disburse: (id: string) => request<Disbursement>(`/offers/${id}/disbursement`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
}

export const aud = ({ amountMinor }: MoneyLike) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amountMinor / 100)
type MoneyLike = { amountMinor: number }
