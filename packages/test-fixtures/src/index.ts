import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { DemoApplication, DocumentSummary, Offer, Outcome } from '@newcredit/domain'
import { aud } from '@newcredit/domain'

export type ScenarioId = 'scenario-a' | 'scenario-b' | 'scenario-c' | 'scenario-h'
export type ScenarioFixture = {
  application: Omit<DemoApplication, 'id' | 'status' | 'version'>
  outcome: Omit<Outcome, 'applicationId'> | null
  offer: Omit<Offer, 'applicationId' | 'status'> | null
}

async function loadJson<T>(root: string, path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, `file://${root}/`), 'utf8')) as T
}

export async function loadScenario(scenarioId: ScenarioId): Promise<ScenarioFixture> {
  const root = fileURLToPath(new URL(`../../../data/synthetic/scenarios/${scenarioId}/`, import.meta.url))
  const [application, customer, employment, accountsFile, financial, affordability, risk, events, manifest, csv] = await Promise.all([
    loadJson<any>(root, 'canonical/application.json'), loadJson<any>(root, 'canonical/customer.json'),
    loadJson<any>(root, 'canonical/employment.json'), loadJson<any>(root, 'canonical/accounts.json'),
    loadJson<any>(root, 'canonical/financial-position.json'), loadJson<any>(root, 'expected/affordability.json'),
    loadJson<any>(root, 'expected/risk-result.json'), loadJson<any>(root, 'expected/events.json'),
    loadJson<any>(root, 'documents/manifest.json'), readFile(new URL('transactions/normalized.csv', `file://${root}/`), 'utf8'),
  ])
  const rows = csv.trim().split(/\r?\n/).slice(1)
  const counts = new Map<string, number>()
  for (const row of rows) { const category = row.split(',')[11]; if (category) counts.set(category, (counts.get(category) ?? 0) + 1) }
  const entries = financial.entries as any[]
  const sum = (kind: string, field: string) => entries.filter((e) => e.kind === kind).reduce((n, e) => n + Number(e[field] ?? 0), 0).toFixed(2)
  const address = customer.residential_address
  const documents: DocumentSummary[] = manifest.documents.map((d: any) => ({ id: d.document_id, type: d.document_type, issuer: d.stated_issuer, periodStart: d.period_start, periodEnd: d.period_end, status: d.processing_status }))
  const offer = events.offer
  const withheld = scenarioId === 'scenario-c'
  const affordabilityResult = affordability.offered_rate ?? affordability.assessment_rate
  return {
    application: {
      scenarioId, fixedDemonstrationDate: manifest.fixed_demonstration_date,
      customer: {
        type: customer.customer_type, name: customer.legal_name.display, dateOfBirth: customer.date_of_birth,
        email: customer.email, phone: customer.phone, address: `${address.line1}, ${address.suburb} ${address.state} ${address.postcode}`,
        employer: employment.employer,
        ...(customer.existing_customer_reference ? { existingCustomerReference: customer.existing_customer_reference, profileConfirmation: customer.profile_confirmation } : {}),
      },
      loan: { amount: aud(application.requested_amount), termYears: application.requested_term_years, purpose: application.loan_purpose, purposeDetail: application.purpose_detail },
      documents: withheld ? [] : documents,
      accounts: accountsFile.accounts.map((a: any) => ({ id: a.account_id, type: a.account_type, ownership: a.ownership, applicantShare: Number(a.applicant_share), bsbMasked: a.bsb_masked, accountMasked: a.account_masked, active: a.active })),
      financialPosition: { assetsTotal: aud(sum('asset', 'amount')), liabilitiesTotal: aud(sum('liability', 'outstanding_balance')), monthlyDebtRepayments: aud(sum('liability', 'normalized_monthly')) },
      review: withheld ? null : { monthlyNetIncome: aud(affordabilityResult.verified_net_income), assessedLivingExpenses: aud(affordabilityResult.assessed_general_living_expenses), monthlyHousing: aud(affordabilityResult.housing), classifiedTransactionCount: rows.length, documentChecksPassed: documents.length, transactionCategories: [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => a.category.localeCompare(b.category)) },
    },
    outcome: withheld ? null : { decision: risk.outcome, riskScore: risk.score, riskBand: risk.band, affordability: risk.affordability, monthlySurplus: aud(affordabilityResult.post_loan_surplus), reasons: risk.reason_codes, factors: (risk.factors ?? []).map((f: any) => ({ factor: f.factor, signal: f.raw, riskValue: f.risk_value })), illustrativeNotOffer: true },
    offer: offer ? { id: offer.offer_id, principal: aud(offer.principal), termYears: offer.term_years, annualRateBasisPoints: Math.round(Number(offer.nominal_annual_rate) * 10_000), monthlyFee: aud(offer.monthly_fee), monthlyRepayment: aud(offer.scheduled_monthly_obligation), totalRepayable: aud(offer.total_repayable), destinationAccountMasked: events.disbursements[0].destination_account_masked, simulationNotice: offer.simulation_notice } : null,
  }
}

export const loadScenarioA = () => loadScenario('scenario-a')
export const loadScenarioB = () => loadScenario('scenario-b')
export const loadScenarioC = () => loadScenario('scenario-c')
export const loadScenarioH = () => loadScenario('scenario-h')

export async function loadScenarioCDocumentData() {
  const root = fileURLToPath(new URL('../../../data/synthetic/scenarios/scenario-c/', import.meta.url))
  const [manifest, checks, extractedFields] = await Promise.all([
    loadJson<any>(root, 'documents/manifest.json'), loadJson<any>(root, 'documents/check-results.json'),
    loadJson<any>(root, 'documents/extracted-fields.json'),
  ])
  const documents = await Promise.all(manifest.documents.map(async (document: any) => ({
    ...document,
    bytes: await readFile(new URL(document.file, `file://${root}/`)),
  })))
  return { manifest, documents, checks: checks.results, extractedFields: extractedFields.fields }
}
