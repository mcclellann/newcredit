export type Money = { amountMinor: number; currency: 'AUD' }
export type DocumentType = 'bank_statement' | 'drivers_licence' | 'payslip'
export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'needs_review'
export type Document = { id: string; type: DocumentType; issuer: string; periodStart: string | null; periodEnd: string | null; status: DocumentStatus }
export type StoredDocument = Document & { applicationId: string; sourceHash: string; mediaType: string; originalName: string; createdAt: string; updatedAt: string }
export type Application = {
  id: string; scenarioId: 'scenario-a' | 'scenario-b' | 'scenario-c' | 'scenario-h'; status: 'documents_required' | 'processing' | 'needs_review' | 'ready_to_submit' | 'submitted' | 'referred' | 'not_approved' | 'offer_accepted' | 'funded'; version: number; fixedDemonstrationDate: string
  customer: { type: 'new' | 'existing'; name: string; dateOfBirth: string; email: string; phone: string; address: string; employer: string; existingCustomerReference?: string; profileConfirmation?: { confirmed: boolean; at: string; fields: string[] } }
  loan: { amount: Money; termYears: number; purpose: string; purposeDetail: string }
  documents: Document[]
  accounts: Array<{ id: string; type: string; ownership: 'sole' | 'joint'; applicantShare: number; bsbMasked: string; accountMasked: string; active: boolean }>
  financialPosition: { assetsTotal: Money; liabilitiesTotal: Money; monthlyDebtRepayments: Money }
  review: { monthlyNetIncome: Money; assessedLivingExpenses: Money; monthlyHousing: Money; classifiedTransactionCount: number; documentChecksPassed: number; transactionCategories: Array<{ category: string; count: number }> } | null
}
export type DocumentCheck = { documentId: string | null; check: string; status: string; details: string; data: Record<string, unknown> }
export type ExtractedField = { id: string; documentId: string; fieldName: string; rawValue: string; normalizedValue: string | null; confidence: string; sourceLocation: { page?: number; line?: string }; reviewRequired: boolean }
export type AuditEvent = { id: string; sequence: number; type: string; at: string; details: Record<string, unknown> }
export type DocumentReview = { status: string; checks: DocumentCheck[]; blockers: DocumentCheck[]; extractedFields: ExtractedField[]; auditEvents: AuditEvent[] }
export type Outcome = { applicationId: string; decision: 'indicatively_approved' | 'referred' | 'not_approved'; riskScore: number; riskBand: 'very_low' | 'moderate' | 'high'; affordability: 'affordable' | 'unaffordable'; monthlySurplus: Money; reasons: string[]; factors: Array<{ factor: string; signal: string; riskValue: number }>; illustrativeNotOffer: true }
export type DemoLogin = { scenarioId: 'scenario-b' | 'scenario-h'; customerReference: string; customerName: string; simulated: true; notice: string }
export type Correction = { id: string; originalValue: string; currentValue: string; applicationVersion: number; createdAt: string }
export type Offer = { id: string; principal: Money; termYears: number; annualRateBasisPoints: number; monthlyFee: Money; monthlyRepayment: Money; totalRepayable: Money; status: 'ready' | 'accepted' | 'funded'; destinationAccountMasked: string; simulationNotice: string }
export type Disbursement = { id: string; amount: Money; status: 'completed'; transferReference: string; destinationAccountMasked: string; simulationNotice: string }
