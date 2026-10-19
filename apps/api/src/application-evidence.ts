import { assessApplication, classifyTransaction, type AssessmentResult, type DemoApplication, type Transaction } from '@newcredit/domain'
import type { ParsedDocument } from './document-extraction.js'

export type Evidence = { id: string; parsed: ParsedDocument }
const cents = (value = '0') => Math.round(Number(value) * 100)
const money = (amountMinor: number) => ({ amountMinor, currency: 'AUD' as const })
const normalizedName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const day = (date: string) => Date.parse(`${date}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const daily = 86400000

/** Rebuild derived fields from stored extraction, never from a chosen sample pack. */
export function assembleEvidence(application: DemoApplication, records: Evidence[]): { application: DemoApplication; issues: string[]; assessment: AssessmentResult | null } {
  const issues: string[] = []
  const licences = records.filter(r => r.parsed.type === 'drivers_licence')
  const payslips = records.filter(r => r.parsed.type === 'payslip')
  const statements = records.filter(r => r.parsed.type === 'bank_statement')
  const reference = new Date(`${application.fixedDemonstrationDate}T00:00:00Z`)
  const end = iso(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1) - daily)
  const start = iso(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 3, 1))
  const payStart = iso(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 2, 1))
  for (const { id, parsed } of records) for (const issue of parsed.issues) issues.push(`${id}: ${issue}`)
  for (const [type, docs] of [['identity', licences], ['payslip', payslips], ['bank statement', statements]] as const) if (!docs.length) issues.push(`Supply ${type} evidence.`)
  const identity = licences[0]?.parsed.fields
  application.customer.name = identity?.name ?? ''
  application.customer.dateOfBirth = identity?.date_of_birth ?? ''
  application.customer.address = identity?.address ?? ''
  application.customer.employer = [...new Set(payslips.map(r => r.parsed.fields.employer).filter(Boolean))].join('; ')
  const names = records.map(r => r.parsed.fields.name).filter((name): name is string => Boolean(name))
  if (new Set(names.map(normalizedName)).size > 1) issues.push('Applicant names differ across documents. Remove incorrect documents or supply consistent evidence.')
  if (identity?.licence_expiry && identity.licence_expiry < application.fixedDemonstrationDate) issues.push('Identity document has expired at the demonstration assessment date.')
  if (identity?.date_of_birth && day(identity.date_of_birth) > Date.UTC(reference.getUTCFullYear() - 18, reference.getUTCMonth(), reference.getUTCDate())) issues.push('Applicant must be at least 18 at the demonstration assessment date.')
  const relevantPays = payslips.filter(r => (r.parsed.fields.pay_date ?? '') >= payStart && (r.parsed.fields.pay_date ?? '') <= end)
  const payDays = new Set<string>()
  const payRates: number[] = []
  for (const { parsed } of relevantPays) {
    const multiplier = ({ weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1 } as Record<string, number>)[parsed.fields.pay_frequency ?? '']
    if (!multiplier) { issues.push('Unsupported pay frequency; weekly, fortnightly or monthly evidence is required.'); continue }
    payRates.push(cents(parsed.fields.net_pay) * multiplier)
    if (parsed.periodStart && parsed.periodEnd) {
      if ((day(parsed.periodEnd) - day(parsed.periodStart)) / daily > 35) { issues.push('Unexpected payslip period length; review required.'); continue }
      for (let date = day(parsed.periodStart); date <= day(parsed.periodEnd); date += daily) {
        const key = iso(date)
        if (payDays.has(key)) issues.push('Overlapping or duplicate pay periods; remove duplicate evidence.')
        payDays.add(key)
      }
    }
  }
  if (payslips.length && payDays.size < 56) issues.push(`Supply at least eight weeks of pay periods paid in ${payStart} to ${end} (two-month demo policy).`)
  const lastPay = relevantPays.map(r => r.parsed.periodEnd ?? '').sort().at(-1)
  const cadence = Math.max(0, ...relevantPays.map(r => ({ weekly: 7, fortnightly: 14, monthly: 31 } as Record<string, number>)[r.parsed.fields.pay_frequency ?? ''] ?? 0))
  if (payslips.length && (!lastPay || day(end) - day(lastPay) > cadence * daily)) issues.push('Recent payslip evidence is missing at the end of the assessment window.')
  const monthlyPayslipIncomeMinor = payRates.length ? Math.floor(payRates.reduce((s, n) => s + n, 0) / payRates.length) : 0
  const accounts = new Map<string, Evidence[]>()
  for (const record of statements) {
    const key = `${record.parsed.fields.bsb ?? ''}/${record.parsed.fields.account ?? ''}`
    accounts.set(key, [...(accounts.get(key) ?? []), record])
  }
  application.accounts = [...accounts].map(([id, docs]) => ({ id, type: 'transaction', ownership: 'sole', applicantShare: 1, bsbMasked: docs[0]!.parsed.fields.bsb ?? '', accountMasked: docs[0]!.parsed.fields.account ?? '', active: true }))
  const transactions: Transaction[] = []
  application.transactions = []
  for (const [account, docs] of accounts) {
    const covered = new Set<string>()
    const ordered = [...docs].sort((a, b) => (a.parsed.periodStart ?? '').localeCompare(b.parsed.periodStart ?? ''))
    let previous: ParsedDocument | undefined
    for (const { id, parsed } of ordered) {
      if (parsed.periodStart && parsed.periodEnd) {
        if (day(parsed.periodEnd) - day(parsed.periodStart) > 370 * daily) { issues.push('Statement period is too large.'); continue }
        for (let date = Math.max(day(start), day(parsed.periodStart)); date <= Math.min(day(end), day(parsed.periodEnd)); date += daily) {
          const key = iso(date)
          if (covered.has(key)) issues.push(`Overlapping statement periods for account ${account}; remove duplicate evidence.`)
          covered.add(key)
        }
        if (previous?.periodEnd && day(previous.periodEnd) + daily === day(parsed.periodStart) && previous.fields.closing_balance !== parsed.fields.opening_balance) issues.push(`Opening balance does not match the previous statement closing balance for account ${account}.`)
      }
      previous = parsed
      parsed.transactions.forEach((tx, index) => {
        if (tx.date < start || tx.date > end) return
        const transactionId = `${id}:${index}`
        const confirmedCategory = application.declarations?.classifications[transactionId]
        const transaction = { ...tx, account, ...(confirmedCategory ? { confirmedCategory } : {}) }
        transactions.push(transaction)
        application.transactions!.push({ ...tx, id: transactionId, documentId: id, account, category: classifyTransaction(transaction) })
      })
    }
    const requiredDays = (day(end) - day(start)) / daily + 1
    if (covered.size !== requiredDays) issues.push(`Supply complete statement coverage ${start} to ${end} for account ${account}: ${covered.size} of ${requiredDays} days supplied.`)
  }
  const declarations = application.declarations
  if (!declarations?.confirmed) issues.push('Confirm household, expenses, commitments and loan details before submission.')
  if (!declarations?.allAccountsConfirmed) issues.push('Confirm statements were supplied for every account with transactions.')
  if (!declarations?.incomeContinuing) issues.push('Confirm income is continuing; otherwise further review is required.')
  if (declarations?.foreseeableChanges.trim() && declarations.foreseeableChanges.trim().toLowerCase() !== 'none') issues.push('Declared foreseeable changes require further review before an automated outcome.')
  if (!application.customer.email.trim() || !application.customer.phone.trim() || !application.loan.purposeDetail.trim()) issues.push('Supply contact details and a specific loan purpose.')
  let assessment: AssessmentResult | null = null
  if (statements.length && declarations) {
    assessment = assessApplication({ applicationId: application.id, principalMinor: application.loan.amount.amountMinor, termYears: application.loan.termYears, monthlyPayslipIncomeMinor, transactions, months: 3, ...declarations })
    application.transactions!.forEach((transaction, index) => { transaction.category = assessment!.categories[index]! })
    if (assessment.categories.some(category => category.startsWith('unclassified') || category === 'cash')) issues.push('Confirm a category for every unknown or cash transaction before submission.')
    const salary = transactions.filter(t => classifyTransaction(t) === 'salary').reduce((sum, t) => sum + t.amountMinor, 0) / 3
    if (monthlyPayslipIncomeMinor && Math.abs(salary - monthlyPayslipIncomeMinor) / monthlyPayslipIncomeMinor > .2) issues.push('Payslip income and statement salary credits differ by more than 20%; reconcile income evidence.')
    issues.push(...assessment.reviewReasons)
    application.review = { ...assessment.review, documentChecksPassed: records.filter(r => r.parsed.issues.length === 0).length }
    application.financialPosition = { assetsTotal: money(declarations.assetsMinor), liabilitiesTotal: money(declarations.liabilitiesMinor), monthlyDebtRepayments: money(assessment.monthlyDebtRepaymentsMinor) }
  } else application.review = null
  const unique = [...new Set(issues)]
  application.status = unique.length ? (records.length ? 'needs_review' : 'documents_required') : 'ready_to_submit'
  return { application, issues: unique, assessment }
}
