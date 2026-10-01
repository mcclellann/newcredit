import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.restoreAllMocks())

describe('Scenario A applicant journey', () => {
  it('presents a welcoming, clearly labelled start state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'scenario-a' }] }), { status: 200 }))
    renderAt('/')
    expect(screen.getByRole('heading', { name: /clear view of your loan application/i })).toBeInTheDocument()
    expect(screen.getByText(/synthetic data only/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /start demonstration/i })).toBeEnabled())
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
