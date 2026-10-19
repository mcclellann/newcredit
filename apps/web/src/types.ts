export type Money = { amountMinor: number; currency: 'AUD' }
export type DocumentType = 'bank_statement' | 'drivers_licence' | 'payslip'
export type DocumentStatus = 'uploaded' | 'processing' | 'processed' | 'needs_review'
export type Document = { id: string; type: DocumentType; issuer: string; periodStart: string | null; periodEnd: string | null; status: DocumentStatus }
export type StoredDocument = Document & { applicationId: string; sourceHash: string; mediaType: string; originalName: string; createdAt: string; updatedAt: string }
export type DocumentRequirement = { type: DocumentType; count: number; text: string; uploadedCount: number; processedCount: number; label?: string; description?: string }
export type ExpectedDocument = { filename: string; type: DocumentType; issuer?: string; periodStart?: string | null; periodEnd?: string | null }
export type DocumentRequirements = {
  expectedCount: number
  uploadedCount: number
  remainingCount: number
  requirements: DocumentRequirement[]
  expectedDocuments?: ExpectedDocument[]
  documents?: ExpectedDocument[]
}
export type DocumentCheck = { documentId: string | null; check: string; status: string; details: string; data: Record<string, unknown> }
export type ExtractedField = { id: string; documentId: string; fieldName: string; rawValue: string; normalizedValue: string | null; confidence: string; sourceLocation: { page?: number; line?: string }; reviewRequired: boolean }
export type AuditEvent = { id: string; sequence: number; type: string; at: string; details: Record<string, unknown> }
export type DocumentReview = { status: string; checks: DocumentCheck[]; blockers: DocumentCheck[]; extractedFields: ExtractedField[]; auditEvents: AuditEvent[] }
export type Outcome = import('../../../packages/domain/src/index').Outcome
export type Application = import('../../../packages/domain/src/index').DemoApplication
export type Declarations = NonNullable<Application['declarations']>
export type ApplicationDetails = { loan: { amountMinor: number; termYears: number; purposeDetail: string }; customer: { email: string; phone: string }; declarations: Declarations }
export type DemoLogin = { customerReference: string; customerName: string; simulated: true; notice: string }
export type Correction = { id: string; originalValue: string; currentValue: string; applicationVersion: number; createdAt: string }
export type Offer = { id: string; principal: Money; termYears: number; annualRateBasisPoints: number; monthlyFee: Money; monthlyRepayment: Money; totalRepayable: Money; status: 'ready' | 'accepted' | 'funded'; destinationAccountMasked: string; simulationNotice: string }
export type Disbursement = { id: string; amount: Money; status: 'completed'; transferReference: string; destinationAccountMasked: string; simulationNotice: string }
