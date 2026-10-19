import type { Money, Outcome } from './index.js'

export type Transaction = { date: string; description: string; amountMinor: number; balanceMinor: number; account?: string; confirmedCategory?: string }
export type AssessmentInput = {
  applicationId: string; principalMinor: number; termYears: number; monthlyPayslipIncomeMinor: number
  transactions: Transaction[]; months: number; adults: 1 | 2; dependants: number; inWorkforce: boolean
  declaredLivingMinor: number; declaredHousingMinor: number; declaredDebtRepaymentsMinor: number; otherCommitmentsMinor: number
}
export type AssessmentResult = {
  outcome: Outcome
  pricing: { annualRateBasisPoints: number; monthlyRepayment: Money; totalRepayable: Money }
  review: { monthlyNetIncome: Money; assessedLivingExpenses: Money; monthlyHousing: Money; classifiedTransactionCount: number; documentChecksPassed: number; transactionCategories: Array<{ category: string; count: number }> }
  monthlyDebtRepaymentsMinor: number; reviewReasons: string[]; categories: string[]
}

// DLEB dleb-2026q1-v1, exact monthly cents from the versioned CSV. Not HEM.
const benchmarks = {
  working: [[204932, 281463, 353873, 426283, 498693], [297934, 370344, 442754, 515164, 586777]],
  nonworking: [[147338, 223864, 296274, 368684, 441099], [240279, 312750, 385160, 457570, 529178]],
}
const money = (amountMinor: number): Money => ({ amountMinor, currency: 'AUD' })

/** Description heuristics only: neither merchant verification nor document/fraud authentication. */
export function classifyTransaction(t: Transaction): string {
  if (t.confirmedCategory) {
    const allowed = t.amountMinor > 0 ? ['salary', 'refund'] : ['living', 'housing', 'debt', 'short_term_credit', 'gambling']
    if (!allowed.includes(t.confirmedCategory)) throw new Error('Invalid confirmed transaction category')
    return t.confirmedCategory
  }
  const d = t.description.toLowerCase()
  if (t.amountMinor > 0) {
    if (/\b(salary|payroll|wages)\b/.test(d)) return 'salary'
    if (/\b(refund|reimbursement)\b/.test(d)) return 'refund'
    return 'unclassified_credit'
  }
  if (/\b(dishonou?r|arrears|overdraft fee|returned payment|reversed payment)\b/.test(d)) return 'payment_stress'
  if (/\b(sportsbet|tabcorp|bet365|casino|gambling|poker)\b/.test(d)) return 'gambling'
  if (/\b(atm|cash withdrawal)\b/.test(d)) return 'cash'
  if (/\b(afterpay|zip pay|bnpl|payday|wage advance)\b/.test(d)) return 'short_term_credit'
  if (/\b(loan repayment|credit card repayment|mortgage repayment)\b/.test(d)) return 'debt'
  if (/\b(rent|housing)\b/.test(d)) return 'housing'
  if (/\b(grocer\w*|supermarket|woolworths|coles|aldi|electricity|utilities|insurance|transport|fuel|restaurant|cafe|medical|pharmacy|internet|phone)\b/.test(d)) return 'living'
  return 'unclassified_debit'
}

/** Caller supplies confirmed declarations and a complete monthly observation window.
 * Review reasons are a hard submission gate. Outcome's legacy union cannot express
 * withheld/marginal: these map to referred; riskScore=0 means withheld, not low risk.
 * No ID, payslip authenticity, fraud or bureau checks are performed here.
 */
export function assessApplication(i: AssessmentInput): AssessmentResult {
  const monetary = [i.principalMinor, i.monthlyPayslipIncomeMinor, i.declaredLivingMinor, i.declaredHousingMinor, i.declaredDebtRepaymentsMinor, i.otherCommitmentsMinor]
  if (monetary.some(x => !Number.isSafeInteger(x) || x < 0) || i.principalMinor < 500000 || i.principalMinor > 10000000) throw new Error('Invalid monetary inputs or principal outside AUD 5,000–100,000')
  if (!Number.isInteger(i.termYears) || i.termYears < 1 || i.termYears > 5) throw new Error('Term must be 1–5 whole years')
  if (!Number.isInteger(i.months) || i.months < 1 || i.months > 120 || !Number.isInteger(i.dependants) || i.dependants < 0 || ![1, 2].includes(i.adults) || typeof i.inWorkforce !== 'boolean' || !i.applicationId.trim()) throw new Error('Invalid assessment inputs')
  for (const t of i.transactions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || new Date(t.date).toISOString().slice(0, 10) !== t.date || !Number.isSafeInteger(t.amountMinor) || !Number.isSafeInteger(t.balanceMinor) || typeof t.description !== 'string') throw new Error('Invalid transaction')
  }
  const reviewReasons: string[] = []
  const categories = i.transactions.map(classifyTransaction)
  // Only one-to-one, same-day equal/opposite transfers explicitly labelled on
  // both sides, across identified uploaded accounts. Unknown counterparties stay expenses.
  i.transactions.forEach((t, n) => {
    if (!t.account || !t.amountMinor || categories[n] === 'internal_transfer' || !/\btransfer\b/i.test(t.description)) return
    const match = i.transactions.findIndex((u, m) => m !== n && categories[m] !== 'internal_transfer' && u.account && u.account !== t.account && u.date === t.date && u.amountMinor === -t.amountMinor && /\btransfer\b/i.test(u.description))
    if (match >= 0) categories[n] = categories[match] = 'internal_transfer'
  })
  const months = [...new Set(i.transactions.map(t => t.date.slice(0, 7)))].sort()
  if (months.length !== i.months || months.some((m, n) => n > 0 && (Number(m.slice(0, 4)) * 12 + Number(m.slice(5))) - (Number(months[n - 1]!.slice(0, 4)) * 12 + Number(months[n - 1]!.slice(5))) !== 1)) reviewReasons.push('Incomplete or conflicting monthly observation window')
  const sum = (category: string) => i.transactions.reduce((s, t, n) => s + (categories[n] === category ? Math.abs(t.amountMinor) : 0), 0)
  const count = (category: string) => categories.filter(c => c === category).length
  const monthly = (category: string) => Math.ceil(sum(category) / i.months)
  const salaries = months.map(m => i.transactions.reduce((s, t, n) => s + (categories[n] === 'salary' && t.date.startsWith(m) ? t.amountMinor : 0), 0))
  const income = Math.min(i.monthlyPayslipIncomeMinor, Math.floor(sum('salary') / i.months))
  if (!income || salaries.some(x => x === 0) || !salaries.length) reviewReasons.push('Missing or discontinuous verified salary evidence')
  // AUD 100 per month aggregate is the explicit demo materiality threshold.
  for (const c of ['cash', 'unclassified_debit', 'unclassified_credit']) if (monthly(c) >= 10000) reviewReasons.push(`Material ${c} requires explanation and classification`)
  const benchmark = benchmarks[i.inWorkforce ? 'working' : 'nonworking'][i.adults - 1]?.[i.dependants]
  if (benchmark === undefined) reviewReasons.push('benchmark_unavailable: unsupported household; no extrapolation')
  const living = Math.max(i.declaredLivingMinor, benchmark ?? 0, monthly('living') + monthly('cash') + monthly('unclassified_debit') + monthly('gambling') + monthly('payment_stress'))
  const housing = Math.max(i.declaredHousingMinor, monthly('housing'))
  const debt = Math.max(i.declaredDebtRepaymentsMinor, monthly('debt') + monthly('short_term_credit'))
  const repayment = (bps: number) => {
    const r = bps / 120000
    return Math.ceil(i.principalMinor * r / (1 - (1 + r) ** (-i.termYears * 12))) + 1500
  }
  const surplusAt = (bps: number) => income - living - housing - debt - i.otherCommitmentsMinor - Math.ceil(repayment(bps) * 1.2)
  const capacity = (ratio: number) => ratio >= .2 ? 0 : ratio >= .1 ? 25 : ratio >= .05 ? 50 : ratio >= 0 ? 75 : 100
  const upper = (x: number, limits: number[]) => [0, 25, 50, 75, 100][limits.filter(v => x > v).length]!
  const normalizedCount = (c: string) => count(c) * 3 / i.months
  const negativeDays = new Set(i.transactions.filter(t => t.balanceMinor < 0).map(t => t.date)).size * 3 / i.months
  const flows = months.map(m => i.transactions.reduce((s, t, n) => s + (t.date.startsWith(m) && categories[n] !== 'internal_transfer' ? t.amountMinor : 0), 0))
  const negativeMonths = flows.filter(x => x < 0).length * 3 / i.months
  const variation = salaries.length && Math.max(...salaries) ? (Math.max(...salaries) - Math.min(...salaries)) / Math.max(...salaries) : 1
  const factors = [
    { factor: 'Post-loan capacity', riskValue: capacity(surplusAt(1900) / (income || 1)), weight: .25, signal: 'Frozen at 19%, AUD 15 fee and 20% obligation buffer' },
    { factor: 'Payment stress', riskValue: upper(normalizedCount('payment_stress'), [0, 1, 2, 4]), weight: .2, signal: 'Observed description-matched events, scaled to three months' },
    { factor: 'Existing debt burden', riskValue: upper(debt / (income || 1), [.1, .2, .3, .4]), weight: .15, signal: 'Greater of declared and observed repayments / income' },
    { factor: 'Cash-flow and balance stability', riskValue: Math.max(upper(negativeDays, [0, 3, 10, 20]), negativeMonths >= 3 ? 100 : negativeMonths >= 2 ? 75 : negativeMonths > 0 ? 50 : flows.some(x => x === 0) ? 25 : 0), weight: .15, signal: 'Observed negative-balance dates only; not inferred daily balances' },
    { factor: 'Income stability', riskValue: variation < .05 ? 0 : variation < .1 ? 25 : variation < .2 ? 50 : variation < .35 ? 75 : 100, weight: .1, signal: 'Monthly salary range / maximum; pay-cycle timing not available' },
    { factor: 'Gambling activity', riskValue: Math.max(upper(monthly('gambling') / (income || 1), [0, .01, .03, .07]), upper(normalizedCount('gambling'), [0, 2, 5, 10])), weight: .1, signal: 'Positively matched gambling only; cash is not gambling' },
    { factor: 'Short-term credit use', riskValue: upper(normalizedCount('short_term_credit'), [0, 1, 2, 3]), weight: .05, signal: 'Observed short-term credit repayment events' },
  ]
  const frozenScore = Math.min(1000, Math.max(1, Math.round(1 + 9.99 * factors.reduce((s, f) => s + f.riskValue * f.weight, 0))))
  const rate = frozenScore < 200 ? 1200 : frozenScore < 400 ? 1550 : 1900
  const surplus = surplusAt(rate)
  const affordable = surplus >= Math.max(30000, income * .05)
  const withheld = reviewReasons.length > 0
  const reasons = [
    ...reviewReasons,
    `DLEB dleb-2026q1-v1; ${i.adults} adult(s), ${i.dependants} dependant(s), workforce=${i.inWorkforce}`,
    `transaction-risk-v1: frozen 19% score ${frozenScore}, surplus ${surplusAt(1900)} cents; final affordability at ${rate / 100}%; no lower-rate rescore`,
    ...factors.filter(f => f.riskValue > 0).sort((a, b) => b.riskValue * b.weight - a.riskValue * a.weight).slice(0, 3).map(f => `Adverse: ${f.factor} (${f.riskValue}/100)`),
    ...factors.filter(f => f.riskValue === 0).map(f => `Positive: ${f.factor}; no observed adverse signal`),
    surplus < 0 ? 'Negative affordability: not approved' : affordable ? 'Meets demonstration surplus buffers' : 'Marginal affordability: review required',
    'Heuristic demo only: not calibrated default probability or authentic fraud scoring; no document authenticity checks performed',
  ]
  return {
    outcome: { applicationId: i.applicationId, decision: withheld ? 'referred' : surplus < 0 ? 'not_approved' : !affordable ? 'referred' : frozenScore >= 750 ? 'not_approved' : frozenScore >= 400 ? 'referred' : 'indicatively_approved', riskScore: withheld ? 0 : frozenScore, riskBand: frozenScore < 200 ? 'very_low' : frozenScore < 400 ? 'low' : frozenScore < 600 ? 'moderate' : frozenScore < 750 ? 'elevated' : frozenScore < 900 ? 'high' : 'severe', affordability: surplus < 0 ? 'unaffordable' : 'affordable', monthlySurplus: money(surplus), reasons, factors: withheld ? [] : factors.map(({ weight: _weight, ...f }) => f), illustrativeNotOffer: true },
    pricing: { annualRateBasisPoints: rate, monthlyRepayment: money(repayment(rate)), totalRepayable: money(repayment(rate) * i.termYears * 12) },
    review: { monthlyNetIncome: money(income), assessedLivingExpenses: money(living), monthlyHousing: money(housing), classifiedTransactionCount: categories.filter(c => !c.startsWith('unclassified')).length, documentChecksPassed: 0, transactionCategories: [...new Set(categories)].sort().map(category => ({ category, count: count(category) })) },
    monthlyDebtRepaymentsMinor: debt, reviewReasons, categories,
  }
}
