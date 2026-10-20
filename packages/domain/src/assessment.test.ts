import { describe, expect, it } from 'vitest'
import { assessApplication, classifyTransaction, type AssessmentInput, type Transaction } from './index.js'

const transaction = (description: string, amountMinor: number, date = '2026-01-20', account = 'daily'): Transaction => ({ description, amountMinor, date, account, balanceMinor: 1000000 })
const input = (overrides: Partial<AssessmentInput> = {}): AssessmentInput => ({
  applicationId: 'customer-controlled-id', principalMinor: 1000000, termYears: 3,
  monthlyPayslipIncomeMinor: 800000, months: 3, adults: 1, dependants: 0, inWorkforce: true,
  declaredLivingMinor: 0, declaredHousingMinor: 100000, declaredDebtRepaymentsMinor: 0, otherCommitmentsMinor: 0,
  transactions: ['01', '02', '03'].flatMap(m => [transaction('ACME payroll', 800000, `2026-${m}-20`), transaction('Groceries', -100000, `2026-${m}-21`)]),
  ...overrides,
})

describe('transaction-driven assessment', () => {
  it('uses lower statement income or payslip, independent of application identity', () => {
    const original = input()
    const changed = original.transactions.map(t => t.amountMinor > 0 ? { ...t, amountMinor: t.amountMinor - 12345 } : t)
    expect(assessApplication(input({ transactions: changed })).review.monthlyNetIncome.amountMinor).toBe(787655)
    expect(assessApplication(input({ monthlyPayslipIncomeMinor: 712345 })).review.monthlyNetIncome.amountMinor).toBe(712345)
    expect(assessApplication(input({ applicationId: 'another-id' })).pricing).toEqual(assessApplication(original).pricing)
    const asymmetric = original.transactions.map((t, n) => n === 1 ? { ...t, amountMinor: -745679 } : t)
    expect(assessApplication(input({ transactions: asymmetric })).review.assessedLivingExpenses.amountMinor).toBe(315227)
  })

  it('uses every documented DLEB household row and respects higher actual declarations', () => {
    // Independent published monthly values (AUD), not calculations from engine internals.
    const rows = [
      [true, 1, [2049.32, 2814.63, 3538.73, 4262.83, 4986.93]],
      [true, 2, [2979.34, 3703.44, 4427.54, 5151.64, 5867.77]],
      [false, 1, [1473.38, 2238.64, 2962.74, 3686.84, 4410.99]],
      [false, 2, [2402.79, 3127.50, 3851.60, 4575.70, 5291.78]],
    ] as const
    for (const [inWorkforce, adults, amounts] of rows) amounts.forEach((amount, dependants) => {
      expect(assessApplication(input({ inWorkforce, adults, dependants })).review.assessedLivingExpenses.amountMinor).toBe(Math.round(amount * 100))
    })
    expect(assessApplication(input({ declaredLivingMinor: 321987 })).review.assessedLivingExpenses.amountMinor).toBe(321987)
    expect(assessApplication(input({ declaredLivingMinor: 321987, declaredHousingMinor: 87654, declaredDebtRepaymentsMinor: 54321 })).observedExpenses).toEqual({ livingMinor: 100000, housingMinor: 0, debtRepaymentsMinor: 0 })
    expect(assessApplication(input({ dependants: 5 })).reviewReasons.join()).toContain('benchmark_unavailable')
  })

  it('does not ignore unknown debits or turn cash into gambling', () => {
    for (const description of ['Unknown merchant', 'ATM cash withdrawal', 'Transfer to someone']) {
      const result = assessApplication(input({ transactions: [...input().transactions, transaction(description, -900000)] }))
      expect(result.review.assessedLivingExpenses.amountMinor).toBe(400000)
      expect(result.reviewReasons.length).toBeGreaterThan(0)
      expect(result.outcome.decision).toBe('referred')
      expect(result.outcome.riskScore).toBe(0)
      expect(result.outcome.factors).toEqual([])
    }
    expect(classifyTransaction(transaction('ATM cash withdrawal', -10000))).toBe('cash')
    const gambling = assessApplication(input({ transactions: [...input().transactions, transaction('Sportsbet', -900000)] }))
    expect(gambling.reviewReasons).toEqual([])
    expect(gambling.outcome.factors.find(f => f.factor === 'Gambling activity')?.riskValue).toBe(100)
  })

  it('requires matched opposite signed equal transfers across identified accounts', () => {
    const pair = [transaction('Transfer savings', -900000), transaction('Transfer daily', 900000, '2026-01-20', 'savings')]
    const baseline = assessApplication(input())
    const paired = assessApplication(input({ transactions: [...input().transactions, ...pair] }))
    expect(paired.reviewReasons).toEqual([])
    expect(paired.outcome.riskScore).toBe(baseline.outcome.riskScore)
    expect(paired.review.transactionCategories).toContainEqual({ category: 'internal_transfer', count: 2 })
    for (const altered of [{ ...pair[1]!, amountMinor: 899999 }, { ...pair[1]!, account: 'daily' }, { ...pair[1]!, account: undefined }]) {
      expect(assessApplication(input({ transactions: [...input().transactions, pair[0]!, altered] })).reviewReasons.length).toBeGreaterThan(0)
    }
  })

  it('excludes refund credits from income, without cancelling unrelated spending', () => {
    const r = assessApplication(input({ transactions: [...input().transactions, transaction('Merchant refund', 300000)] }))
    expect(r.review.monthlyNetIncome.amountMinor).toBe(800000)
    expect(r.review.assessedLivingExpenses.amountMinor).toBe(204932)
  })

  it('offers all three rate tiers using frozen maximum-rate risk', () => {
    const stress = (n: number) => Array.from({ length: n }, (_, j) => transaction('Dishonour fee', -1000, `2026-01-${String(j + 1).padStart(2, '0')}`))
    const low = assessApplication(input())
    const middle = assessApplication(input({ transactions: [...input().transactions, ...stress(5)] }))
    const high = assessApplication(input({ declaredDebtRepaymentsMinor: 330000, transactions: [...input().transactions, ...stress(5), transaction('Sportsbet', -180000)] }))
    expect(low.pricing.annualRateBasisPoints).toBe(1200)
    expect(middle.pricing.annualRateBasisPoints).toBe(1550)
    expect(high.pricing.annualRateBasisPoints).toBe(1900)
    expect(middle.outcome.riskScore).toBeGreaterThanOrEqual(200)
    expect(middle.outcome.riskScore).toBeLessThan(400)
    expect(high.outcome.riskScore).toBeGreaterThanOrEqual(400)
    expect(high.outcome.decision).toBe('referred')
  })

  it('does not optimistically rescore across a pricing boundary at the offered rate', () => {
    const stress = [1, 2, 3].map(day => transaction('Dishonour fee', -1000, `2026-01-0${day}`))
    const r = assessApplication(input({ otherCommitmentsMinor: 290000, transactions: [...input().transactions, ...stress] }))
    expect(r.outcome.factors.find(f => f.factor === 'Post-loan capacity')?.riskValue).toBe(25)
    expect(r.outcome.monthlySurplus.amountMinor / 800000).toBeGreaterThanOrEqual(.2)
    expect(r.pricing.annualRateBasisPoints).toBe(1550)
    expect(r.outcome.riskScore).toBeGreaterThanOrEqual(200)
  })

  it('includes the monthly fee in repayments, total cost and stressed obligation', () => {
    // Independently amortize by rolling the outstanding balance forward monthly.
    const r = assessApplication(input())
    const payment = r.pricing.monthlyRepayment.amountMinor
    let balance = 1000000
    for (let n = 0; n < 36; n++) balance = balance * 1.01 - (payment - 1500)
    expect(balance).toBeLessThanOrEqual(0)
    expect(balance).toBeGreaterThan(-50)
    expect(r.pricing.totalRepayable.amountMinor).toBe(payment * 36)
    expect(r.outcome.monthlySurplus.amountMinor).toBe(800000 - 204932 - 100000 - Math.ceil(payment * 1.2))
    expect(Number.isInteger(r.outcome.monthlySurplus.amountMinor)).toBe(true)
  })

  it('never approves negative affordability, and refers marginal capacity', () => {
    const bad = assessApplication(input({ otherCommitmentsMinor: 500000 }))
    expect(bad.outcome.monthlySurplus.amountMinor).toBeLessThan(0)
    expect(bad.outcome.decision).toBe('not_approved')
    const marginal = assessApplication(input({ otherCommitmentsMinor: 425000 }))
    expect(marginal.outcome.monthlySurplus.amountMinor).toBeGreaterThanOrEqual(0)
    expect(marginal.outcome.monthlySurplus.amountMinor).toBeLessThan(40000)
    expect(marginal.outcome.decision).toBe('referred')
  })

  it('validates product boundaries, integer money and missing evidence', () => {
    for (const overrides of [{ termYears: 1.5 }, { termYears: 6 }, { principalMinor: 499999 }, { principalMinor: 10000001 }, { declaredLivingMinor: -1 }, { monthlyPayslipIncomeMinor: 123.4 }, { months: 0 }]) expect(() => assessApplication(input(overrides))).toThrow()
    const empty = assessApplication(input({ transactions: [] }))
    expect(empty.reviewReasons.length).toBeGreaterThan(0)
    expect(empty.outcome.decision).toBe('referred')
    expect(empty.review.documentChecksPassed).toBe(0)
  })
})
