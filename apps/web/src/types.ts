export type Money = { amountMinor: number; currency: 'AUD' }
export type Document = { id: string; type: 'bank_statement' | 'drivers_licence' | 'payslip'; issuer: string; periodStart: string | null; periodEnd: string | null; status: 'processed' }
export type Application = {
  id: string; scenarioId: 'scenario-a' | 'scenario-b'; status: 'ready_to_submit' | 'submitted' | 'referred' | 'offer_accepted' | 'funded'; version: number; fixedDemonstrationDate: string
  customer: { type: 'new' | 'existing'; name: string; dateOfBirth: string; email: string; phone: string; address: string; employer: string; existingCustomerReference?: string; profileConfirmation?: { confirmed: boolean; at: string; fields: string[] } }
  loan: { amount: Money; termYears: number; purpose: string; purposeDetail: string }
  documents: Document[]
  accounts: Array<{ id: string; type: string; ownership: 'sole' | 'joint'; applicantShare: number; bsbMasked: string; accountMasked: string; active: boolean }>
  financialPosition: { assetsTotal: Money; liabilitiesTotal: Money; monthlyDebtRepayments: Money }
  review: { monthlyNetIncome: Money; assessedLivingExpenses: Money; monthlyHousing: Money; classifiedTransactionCount: number; documentChecksPassed: number; transactionCategories: Array<{ category: string; count: number }> }
}
export type Outcome = { applicationId: string; decision: 'indicatively_approved' | 'referred'; riskScore: number; riskBand: 'very_low' | 'moderate'; affordability: 'affordable'; monthlySurplus: Money; reasons: string[]; factors: Array<{ factor: string; signal: string; riskValue: number }>; illustrativeNotOffer: true }
export type DemoLogin = { scenarioId: 'scenario-b'; customerReference: string; customerName: string; simulated: true; notice: string }
export type Correction = { id: string; originalValue: string; currentValue: string; applicationVersion: number; createdAt: string }
export type Offer = { id: string; principal: Money; termYears: number; annualRateBasisPoints: number; monthlyFee: Money; monthlyRepayment: Money; totalRepayable: Money; status: 'ready' | 'accepted' | 'funded'; destinationAccountMasked: string; simulationNotice: string }
export type Disbursement = { id: string; amount: Money; status: 'completed'; transferReference: string; destinationAccountMasked: string; simulationNotice: string }
