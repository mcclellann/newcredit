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
