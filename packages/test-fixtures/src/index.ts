import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { DemoApplication, DocumentSummary, Offer, Outcome } from '@newcredit/domain'
import { aud } from '@newcredit/domain'

const scenarioRoot = fileURLToPath(
  new URL('../../../data/synthetic/scenarios/scenario-a/', import.meta.url),
)

async function json<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(new URL(relativePath, `file://${scenarioRoot}/`), 'utf8')) as T
}

export type ScenarioA = {
  application: Omit<DemoApplication, 'id' | 'status' | 'version'>
  outcome: Omit<Outcome, 'applicationId'>
  offer: Omit<Offer, 'applicationId' | 'status'>
}

export async function loadScenarioA(): Promise<ScenarioA> {
  const [application, customer, employment, affordability, risk, events, manifest, transactions] =
    await Promise.all([
      json<any>('canonical/application.json'),
      json<any>('canonical/customer.json'),
      json<any>('canonical/employment.json'),
      json<any>('expected/affordability.json'),
      json<any>('expected/risk-result.json'),
      json<any>('expected/events.json'),
      json<any>('documents/manifest.json'),
      readFile(new URL('transactions/normalized.csv', `file://${scenarioRoot}/`), 'utf8'),
    ])

  const address = customer.residential_address
  const documents: DocumentSummary[] = manifest.documents.map((document: any) => ({
    id: document.document_id,
    type: document.document_type,
    issuer: document.stated_issuer,
    periodStart: document.period_start,
    periodEnd: document.period_end,
    status: document.processing_status,
  }))
  const offer = events.offer

  return {
    application: {
      scenarioId: 'scenario-a',
      fixedDemonstrationDate: manifest.fixed_demonstration_date,
      customer: {
        type: 'new',
        name: customer.legal_name.display,
        dateOfBirth: customer.date_of_birth,
        email: customer.email,
        phone: customer.phone,
        address: `${address.line1}, ${address.suburb} ${address.state} ${address.postcode}`,
        employer: employment.employer,
      },
      loan: {
        amount: aud(application.requested_amount),
        termYears: application.requested_term_years,
        purpose: application.loan_purpose,
        purposeDetail: application.purpose_detail,
      },
      documents,
      review: {
        monthlyNetIncome: aud(affordability.offered_rate.verified_net_income),
        assessedLivingExpenses: aud(affordability.offered_rate.assessed_general_living_expenses),
        monthlyHousing: aud(affordability.offered_rate.housing),
        classifiedTransactionCount: Math.max(0, transactions.trim().split(/\r?\n/).length - 1),
        documentChecksPassed: documents.length,
      },
    },
    outcome: {
      decision: risk.outcome,
      riskScore: risk.score,
      riskBand: risk.band,
      affordability: risk.affordability,
      monthlySurplus: aud(affordability.offered_rate.post_loan_surplus),
      reasons: risk.reason_codes,
      illustrativeNotOffer: true,
    },
    offer: {
      id: offer.offer_id,
      principal: aud(offer.principal),
      termYears: offer.term_years,
      annualRateBasisPoints: Math.round(Number(offer.nominal_annual_rate) * 10_000),
      monthlyFee: aud(offer.monthly_fee),
      monthlyRepayment: aud(offer.scheduled_monthly_obligation),
      totalRepayable: aud(offer.total_repayable),
      destinationAccountMasked: events.disbursements[0].destination_account_masked,
      simulationNotice: offer.simulation_notice,
    },
  }
}
