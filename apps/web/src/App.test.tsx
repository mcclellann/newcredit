import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import type { Application, ApplicationDetails, DocumentType } from './types'

function renderAt(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
const empty = (): Application => ({ id: 'app', scenarioId: 'document-driven', status: 'documents_required', version: 1, fixedDemonstrationDate: '2026-10-01', customer: { type: 'new', name: '', dateOfBirth: '', email: '', phone: '', address: '', employer: '' }, loan: { amount: { amountMinor: 0, currency: 'AUD' }, termYears: 0, purpose: '', purposeDetail: '' }, documents: [], accounts: [], financialPosition: { assetsTotal: { amountMinor: 0, currency: 'AUD' }, liabilitiesTotal: { amountMinor: 0, currency: 'AUD' }, monthlyDebtRepayments: { amountMinor: 0, currency: 'AUD' } }, review: null })
const review = { checks: [], blockers: [{ check: 'coverage', details: 'Supply complete periods.' }], extractedFields: [], auditEvents: [], status: 'needs_review' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('starts a new application without selecting a scenario or applicant', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/document-requirements')) return json({ requirements: [] })
    if (String(input).endsWith('/document-review')) return json(review)
    return json(empty())
  })
  renderAt('/')
  expect(screen.queryByText(/high-risk outcome example|Avery|Morgan|Casey|Taylor/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /new customer/i }))
  await screen.findByRole('heading', { name: 'Your documents' })
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/applications')
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ customerType: 'new' })
})

it('logs in without a scenario and creates an empty existing application that still needs identity', async () => {
  const requests: Array<{ url: string; body: unknown }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.endsWith('/login')) return json({ customerReference: 'DEMO-EXISTING', customerName: 'Demo customer', simulated: true, notice: 'Not identity verification.' })
    if (url.endsWith('/document-requirements')) return json({ requirements: [] })
    if (url.endsWith('/document-review')) return json(review)
    return json({ ...empty(), customer: { ...empty().customer, type: 'existing' } })
  })
  renderAt('/login')
  fireEvent.click(screen.getByRole('button', { name: /log in/i }))
  expect(await screen.findByText('Demo customer')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /continue application/i }))
  expect(await screen.findByLabelText(/add\/replace identity/i)).toBeInTheDocument()
  expect(requests[0].body).toEqual({})
  expect(requests.find(r => r.url.endsWith('/applications'))?.body).toEqual({ customerType: 'existing' })
})

it('accepts arbitrary stage counts, continues through review issues, saves declarations and classifies with explicit consent', async () => {
  let app = empty(); let saved: ApplicationDetails | undefined; let submitted = false; let removed = false
  const uploads: FormData[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/document-requirements')) return json({ expectedCount: 3, uploadedCount: app.documents.length, remainingCount: 3, expectedDocuments: [], requirements: ['drivers_licence', 'payslip', 'bank_statement'].map(type => ({ type, count: 1, text: type, uploadedCount: 0, processedCount: 0 })) })
    if (url.endsWith('/document-review')) return json(review)
    if (init?.method === 'DELETE') {
      removed = true; app = { ...app, documents: app.documents.filter(d => !url.endsWith(`/${d.id}`)) }; return json(app)
    }
    if (url.includes('/documents?')) {
      expect(init?.headers).toBeUndefined()
      uploads.push(init!.body as FormData)
      const type = new URL(url, 'https://test').searchParams.get('documentType') as DocumentType
      const doc = { id: `doc-${app.documents.length}`, type, issuer: 'Synthetic', periodStart: null, periodEnd: null, status: 'uploaded' as const }
      app = { ...app, documents: [...app.documents, doc] }; return json(doc)
    }
    if (url.includes('/document-processing?')) {
      const type = new URL(url, 'https://test').searchParams.get('documentType')
      app = { ...app, status: 'needs_review', customer: { ...app.customer, name: 'Taylor Extracted', employer: 'Document Employer' }, declarations: { adults: 1, dependants: 0, inWorkforce: false, declaredLivingMinor: 186590, declaredHousingMinor: 140000, declaredDebtRepaymentsMinor: 12345, assetsMinor: 1063349, liabilitiesMinor: 40000, otherCommitmentsMinor: 0, confirmed: false, allAccountsConfirmed: false, incomeContinuing: false, foreseeableChanges: '', classifications: {} }, documents: app.documents.map(d => d.type === type ? { ...d, status: 'needs_review' } : d), transactions: [{ id: 'tx', documentId: 'doc-3', date: '2026-09-01', description: 'Unknown purchase', amountMinor: -1234, balanceMinor: 60000, account: 'Synthetic account', category: 'unclassified_debit' }] }; return json(app)
    }
    if (url.endsWith('/details')) {
      saved = JSON.parse(String(init?.body)); app = { ...app, status: 'ready_to_submit', declarations: saved!.declarations }; return json(app)
    }
    if (url.endsWith('/submission')) { submitted = true; return json(app) }
    if (url.endsWith('/outcome')) return json({ decision: 'not_approved', riskScore: 701, riskBand: 'high', affordability: 'affordable', monthlySurplus: { amountMinor: 12345 }, reasons: ['HIGH_RISK_SCORE'], factors: [{ factor: 'payment_stress', signal: 'Actual evidence signal', riskValue: 80 }] })
    return json(app)
  })
  renderAt('/applications/app/documents')
  await screen.findByLabelText(/add\/replace identity/i)
  fireEvent.change(screen.getByLabelText('Sample pack'), { target: { value: 'scenario-h' } })
  expect(screen.getByRole('link', { name: /download sample/i })).toHaveAttribute('href', '/api/v1/applications/app/documents/demo-pack?pack=scenario-h')
  for (const [label, count] of [['identity', 2], ['income', 1], ['bank statements', 4]] as const) {
    const input = await screen.findByLabelText(`Add/replace ${label} documents`)
    fireEvent.change(input, { target: { files: Array.from({ length: count }, (_, i) => new File(['synthetic'], `${label}-${i}.pdf`, { type: 'application/pdf' })) } })
    fireEvent.click(screen.getByRole('button', { name: `Upload and process ${label}` }))
    await waitFor(() => expect(screen.getByRole('button', { name: `Upload and process ${label}` })).toBeDisabled())
  }
  const remove = await screen.findByRole('button', { name: 'Remove Identity document 1' })
  await waitFor(() => expect(remove).toBeEnabled())
  fireEvent.click(remove)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Identity document 2' })).not.toBeInTheDocument())
  expect(removed).toBe(true)
  fireEvent.click(await screen.findByRole('link', { name: /continue to review/i }))
  expect(await screen.findByRole('heading', { name: 'Check your application' })).toBeInTheDocument()
  expect(uploads).toHaveLength(7)
  expect(screen.getByText(/Supply complete periods\./)).toBeInTheDocument()
  expect(screen.getByText('Taylor Extracted')).toBeInTheDocument()
  expect(screen.getByText('Document Employer')).toBeInTheDocument()
  expect(screen.getByLabelText('Monthly living expenses ($)')).toHaveValue(1865.9)
  expect(screen.getByLabelText('Monthly housing costs ($)')).toHaveValue(1400)
  expect(screen.getByLabelText('Monthly debt repayments ($)')).toHaveValue(123.45)
  expect(screen.getByLabelText('Assets ($)')).toHaveValue(10633.49)
  expect(screen.getByLabelText('Liabilities ($)')).toHaveValue(400)
  expect(screen.getByLabelText('Email')).toHaveValue('')
  const applicantConsent = screen.getByLabelText(/I explicitly confirm/i)
  expect(applicantConsent).not.toBeChecked()
  fireEvent.change(screen.getByLabelText('Loan amount ($)'), { target: { value: '17000' } })
  fireEvent.change(screen.getByLabelText('Term (whole years)'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Purpose detail'), { target: { value: 'Synthetic repairs' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'synthetic@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0400000000' } })
  fireEvent.change(screen.getByLabelText(/Foreseeable changes/), { target: { value: 'None' } })
  for (const label of ['I am in the workforce', 'I have supplied all accounts', 'My income is continuing']) fireEvent.click(screen.getByLabelText(label))
  fireEvent.click(applicantConsent)
  fireEvent.change(screen.getByLabelText('Classify Unknown purchase'), { target: { value: 'living' } })
  expect(applicantConsent).not.toBeChecked()
  fireEvent.click(applicantConsent)
  fireEvent.click(screen.getByRole('button', { name: /save details/i }))
  await waitFor(() => expect(saved?.declarations.confirmed).toBe(true))
  expect(saved?.declarations.classifications).toEqual({ tx: 'living' })
  expect(saved?.declarations).toMatchObject({ declaredLivingMinor: 186590, declaredHousingMinor: 140000, declaredDebtRepaymentsMinor: 12345, assetsMinor: 1063349, liabilitiesMinor: 40000 })
  expect(saved?.loan).toEqual({ amountMinor: 1700000, termYears: 3, purposeDetail: 'Synthetic repairs' })
  const submit = screen.getByRole('button', { name: /submit for/i })
  expect(submit).toBeDisabled()
  await waitFor(() => expect(screen.getByLabelText(/I confirm submission/i)).toBeEnabled())
  fireEvent.click(screen.getByLabelText(/I confirm submission/i))
  fireEvent.click(submit)
  expect(await screen.findByRole('heading', { name: /not approved/i })).toBeInTheDocument()
  expect(submitted).toBe(true)
  expect(screen.getByText('Actual evidence signal')).toBeInTheDocument()
  expect(screen.getByText('$123.45 estimated monthly capacity')).toBeInTheDocument()
  expect(screen.getByText('affordable')).toBeInTheDocument()
  expect(screen.queryByText(/negative monthly/i)).not.toBeInTheDocument()
})

it('shows the actual fractional offer rate', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ principal: { amountMinor: 1700000 }, termYears: 3, annualRateBasisPoints: 1550, monthlyFee: { amountMinor: 1000 }, monthlyRepayment: { amountMinor: 60000 }, totalRepayable: { amountMinor: 2160000 }, status: 'ready' }))
  renderAt('/applications/app/offer')
  expect(await screen.findByText('15.5% p.a.')).toBeInTheDocument()
})
