import type { Application, Correction, DemoLogin, Disbursement, DocumentReview, DocumentType, Offer, Outcome, StoredDocument } from './types'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers,
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
  login: () => request<DemoLogin>('/demo-sessions/login', { method: 'POST', body: JSON.stringify({ scenarioId: 'scenario-b' }) }),
  createApplication: (scenarioId: 'scenario-a' | 'scenario-b' | 'scenario-c' = 'scenario-a') => request<Application>('/applications', { method: 'POST', body: JSON.stringify({ scenarioId }) }),
  application: (id: string) => request<Application>(`/applications/${id}`),
  documents: (id: string) => request<{ documents: StoredDocument[] }>(`/applications/${id}/documents`),
  stageDemoDocuments: (id: string) => request<{ documents: StoredDocument[] }>(`/applications/${id}/documents/stage-demo`, { method: 'POST' }),
  uploadDocument: async (id: string, documentType: DocumentType, file: File) => {
    const body = new FormData(); body.append('file', file)
    const response = await fetch(`${base}/api/v1/applications/${id}/documents?documentType=${documentType}`, { method: 'POST', body })
    if (!response.ok) { let message = 'The document could not be uploaded.'; try { message = (await response.json() as { detail?: string }).detail || message } catch { /* safe fallback */ }; throw new ApiError(message, response.status) }
    return response.json() as Promise<StoredDocument>
  },
  processDocuments: (id: string) => request<Application>(`/applications/${id}/document-processing`, { method: 'POST' }),
  documentReview: (id: string) => request<DocumentReview>(`/applications/${id}/document-review`),
  correctPurpose: (id: string, purposeDetail: string) => request<Correction>(`/applications/${id}/corrections`, { method: 'POST', body: JSON.stringify({ purposeDetail }) }),
  submit: (id: string) => request<Application>(`/applications/${id}/submission`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
  outcome: (id: string) => request<Outcome>(`/applications/${id}/outcome`),
  offer: (id: string) => request<Offer>(`/applications/${id}/offer`),
  accept: (id: string) => request<Offer>(`/offers/${id}/acceptance`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
  disburse: (id: string) => request<Disbursement>(`/offers/${id}/disbursement`, { method: 'POST', headers: { 'Idempotency-Key': key() }, body: JSON.stringify({ confirmation: true }) }),
}

export const aud = ({ amountMinor }: MoneyLike) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amountMinor / 100)
type MoneyLike = { amountMinor: number }
