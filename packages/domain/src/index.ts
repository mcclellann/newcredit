export type ApplicationStatus =
  | 'ready_to_submit'
  | 'submitted'
  | 'referred'
  | 'offer_accepted'
  | 'funded'

export type Money = {
  amountMinor: number
  currency: 'AUD'
}

export type DocumentSummary = {
  id: string
  type: 'bank_statement' | 'drivers_licence' | 'payslip'
  issuer: string
  periodStart: string | null
  periodEnd: string | null
  status: 'processed'
}

export type DemoApplication = {
  id: string
  scenarioId: 'scenario-a' | 'scenario-b'
  status: ApplicationStatus
  version: number
  fixedDemonstrationDate: string
  customer: {
    type: 'new' | 'existing'
    name: string
    dateOfBirth: string
    email: string
    phone: string
    address: string
    employer: string
    existingCustomerReference?: string
    profileConfirmation?: { confirmed: boolean; at: string; fields: string[] }
  }
  loan: {
    amount: Money
    termYears: number
    purpose: string
    purposeDetail: string
  }
  documents: DocumentSummary[]
  accounts: Array<{ id: string; type: string; ownership: 'sole' | 'joint'; applicantShare: number; bsbMasked: string; accountMasked: string; active: boolean }>
  financialPosition: {
    assetsTotal: Money
    liabilitiesTotal: Money
    monthlyDebtRepayments: Money
  }
  review: {
    monthlyNetIncome: Money
    assessedLivingExpenses: Money
    monthlyHousing: Money
    classifiedTransactionCount: number
    documentChecksPassed: number
    transactionCategories: Array<{ category: string; count: number }>
  }
}

export type Outcome = {
  applicationId: string
  decision: 'indicatively_approved' | 'referred'
  riskScore: number
  riskBand: 'very_low' | 'moderate'
  affordability: 'affordable'
  monthlySurplus: Money
  reasons: string[]
  factors: Array<{ factor: string; signal: string; riskValue: number }>
  illustrativeNotOffer: true
}

export type Offer = {
  id: string
  applicationId: string
  principal: Money
  termYears: number
  annualRateBasisPoints: number
  monthlyFee: Money
  monthlyRepayment: Money
  totalRepayable: Money
  status: 'ready' | 'accepted' | 'funded'
  destinationAccountMasked: string
  simulationNotice: string
}

export type Disbursement = {
  id: string
  offerId: string
  amount: Money
  status: 'completed'
  transferReference: string
  destinationAccountMasked: string
  simulationNotice: string
}

export const aud = (dollars: string): Money => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(dollars)
  if (!match) throw new Error(`Invalid AUD amount: ${dollars}`)
  const [, whole, fraction = ''] = match
  return {
    amountMinor: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
    currency: 'AUD',
  }
}

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  const allowed: Record<ApplicationStatus, ApplicationStatus[]> = {
    ready_to_submit: ['submitted', 'referred'],
    submitted: ['offer_accepted'],
    referred: [],
    offer_accepted: ['funded'],
    funded: [],
  }
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid application transition: ${from} -> ${to}`)
  }
}
