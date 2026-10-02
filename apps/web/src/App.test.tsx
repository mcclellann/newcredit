import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Scenario A applicant journey', () => {
  it('presents a welcoming, clearly labelled start state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'scenario-a' }] }), { status: 200 }))
    renderAt('/')
    expect(screen.getByRole('heading', { name: /clear view of your loan application/i })).toBeInTheDocument()
    expect(screen.getByText(/synthetic data only/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /new customer/i })).toBeEnabled())
    expect(screen.getByRole('button', { name: /existing customer/i })).toBeEnabled()
  })

  it('shows the submitted indicative outcome from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      applicationId: 'app-1', decision: 'indicatively_approved', riskScore: 1, riskBand: 'very_low', affordability: 'affordable',
      monthlySurplus: { amountMinor: 223553, currency: 'AUD' }, reasons: ['stable_income', 'positive_cash_flow'], illustrativeNotOffer: true,
    }), { status: 200 }))
    renderAt('/applications/app-1/outcome')
    expect(await screen.findByRole('heading', { name: /indicatively approved/i })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/affordable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review simulated offer/i })).toBeInTheDocument()
  })
})

describe('Existing customer journey', () => {
  it('uses a clearly simulated login and confirms Morgan’s profile', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ scenarioId: 'scenario-b', customerReference: 'EXIST-SYN-B-204', customerName: 'Morgan Sample', simulated: true, notice: 'Demonstration login only; this is not production authentication.' }), { status: 200 }))
    renderAt('/login')
    expect(screen.getByRole('heading', { name: /simulated secure login/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /log in to demo profile/i }))
    expect(await screen.findByText('Morgan Sample')).toBeInTheDocument()
    expect(screen.getByText(/not production authentication/i)).toBeInTheDocument()
  })

  it('shows referral as a terminal outcome without an offer action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      applicationId: 'app-b', decision: 'referred', riskScore: 488, riskBand: 'moderate', affordability: 'affordable',
      monthlySurplus: { amountMinor: 48806, currency: 'AUD' }, reasons: ['RECURRING_DEBT_BURDEN', 'VARIABLE_CONTINUING_INCOME'],
      factors: [{ factor: 'payment_stress', signal: 'short_term_credit_and_gambling', riskValue: 73 }], illustrativeNotOffer: true,
    }), { status: 200 }))
    renderAt('/applications/app-b/outcome')
    expect(await screen.findByRole('heading', { name: /has been referred/i })).toBeInTheDocument()
    expect(screen.getByText('488')).toBeInTheDocument()
    expect(screen.getByText(/no offer or funds movement is available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review simulated offer/i })).not.toBeInTheDocument()
  })
})

describe('Document review journey', () => {
  const application = { id: 'app-c', scenarioId: 'scenario-c', status: 'documents_required', version: 1, fixedDemonstrationDate: '2026-10-01', customer: { type: 'new', name: 'Casey Fiction' }, documents: [], review: null }
  const documents = Array.from({ length: 7 }, (_, index) => ({ id: `doc-${index}`, applicationId: 'app-c', sourceHash: `${index}`, mediaType: 'application/pdf', originalName: `${index}.pdf`, type: index < 2 ? 'bank_statement' : index === 2 ? 'drivers_licence' : 'payslip', issuer: 'Synthetic issuer', periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'uploaded', createdAt: '', updatedAt: '' }))

  it('offers the choice and shows intake requirements and seven staged documents', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/demo-scenarios')) return new Response(JSON.stringify({ scenarios: [] }), { status: 200 })
      if (url.endsWith('/applications/app-c')) return new Response(JSON.stringify(application), { status: 200 })
      if (url.endsWith('/applications/app-c/documents/stage-demo')) {
        expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
        return new Response(JSON.stringify({ documents }), { status: 200 })
      }
      return new Response(JSON.stringify({ documents: [] }), { status: 200 })
    })
    renderAt('/')
    await waitFor(() => expect(screen.getByRole('button', { name: /document review example/i })).toBeEnabled())
    cleanup(); renderAt('/applications/app-c/documents')
    expect(await screen.findByRole('heading', { name: /Casey Fiction’s documents/i })).toBeInTheDocument()
    expect(screen.getByText(/three months of statements/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /use prepared synthetic document pack/i }))
    expect(await screen.findByText('7 of 7 documents uploaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /process documents/i })).toBeEnabled()
  })

  it('shows exactly two blockers, licence provenance, and no outcome actions', async () => {
    const statementBlocker = { documentId: null, check: 'required_statement_coverage', status: 'needs_review', details: 'July statement absent.', data: { account_id: 'ACCT-SYN-C1', missing_periods: [{ start: '2026-07-01', end: '2026-07-31' }] } }
    const licenceBlocker = { documentId: 'lic', check: 'field_readability', status: 'needs_review', details: 'Licence number region is deliberately obscured.', data: { field_name: 'licence_number' } }
    const review = { status: 'needs_review', checks: [statementBlocker, licenceBlocker], blockers: [statementBlocker, licenceBlocker], extractedFields: [{ id: 'f', documentId: 'lic', fieldName: 'licence_number', rawValue: '[UNREADABLE]', normalizedValue: null, confidence: '0.12', sourceLocation: { page: 1, line: 'Licence' }, reviewRequired: true }], auditEvents: [] }
    const processedDocuments = documents.map((document, index) => ({ ...document, status: index === 2 ? 'needs_review' : 'processed' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith('/document-review') ? review : { ...application, status: 'needs_review', version: 2, documents: processedDocuments }), { status: 200 }))
    renderAt('/applications/app-c/document-review')
    expect(await screen.findByRole('heading', { name: 'Two items need attention' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '2 blockers' }).querySelectorAll('article')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'July 2026 statement is missing' })).toBeInTheDocument()
    expect(screen.getByText('ACCT-SYN-C1')).toBeInTheDocument()
    expect(screen.getByText(/1 July 2026–31 July 2026/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Licence number is unreadable' })).toBeInTheDocument()
    expect(screen.getByText('[UNREADABLE]')).toBeInTheDocument()
    expect(screen.getByText('Unavailable (null)')).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
    expect(screen.getByText('Page 1 / Licence')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Document needs review').parentElement).toHaveTextContent('1Document needs review')
    expect(screen.queryByRole('button', { name: /submit|offer/i })).not.toBeInTheDocument()
  })
})
