export type Money = { amountMinor: number; currency: 'AUD' }
export type Document = { id: string; type: 'bank_statement' | 'drivers_licence' | 'payslip'; issuer: string; periodStart: string | null; periodEnd: string | null; status: 'processed' }
export type Application = {
  id: string; status: 'ready_to_submit' | 'submitted' | 'offer_accepted' | 'funded'
  customer: { name: string; dateOfBirth: string; email: string; phone: string; address: string; employer: string }
  loan: { amount: Money; termYears: number; purpose: string; purposeDetail: string }
  documents: Document[]
  review: { monthlyNetIncome: Money; assessedLivingExpenses: Money; monthlyHousing: Money; classifiedTransactionCount: number; documentChecksPassed: number }
}
export type Outcome = { applicationId: string; decision: 'indicatively_approved'; riskScore: number; riskBand: 'very_low'; affordability: 'affordable'; monthlySurplus: Money; reasons: string[]; illustrativeNotOffer: true }
export type Offer = { id: string; principal: Money; termYears: number; annualRateBasisPoints: number; monthlyFee: Money; monthlyRepayment: Money; totalRepayable: Money; status: 'ready' | 'accepted' | 'funded'; destinationAccountMasked: string; simulationNotice: string }
export type Disbursement = { id: string; amount: Money; status: 'completed'; transferReference: string; destinationAccountMasked: string; simulationNotice: string }
