# Demonstration Living Expense Benchmark

**Version:** `dleb-2026q1-v1`  
**Status:** Approved for synthetic demonstration fixtures  
**Effective source period:** March quarter 2026

## 1. Purpose

Provide a transparent national living-expense floor for the affordability
demonstration when the proprietary Household Expenditure Measure (HEM) is not
licensed. This benchmark is called **DLEB**, never HEM.

DLEB is only a plausibility and serviceability input. It does not replace
applicant-specific inquiries, verified expenses, liabilities, foreseeable
changes, or an assessment of substantial hardship.

## 2. Public source

DLEB v1 reproduces the **other than housing** values in Table 1 of the Melbourne
Institute's free [Poverty Lines Australia, March quarter 2026](https://melbourneinstitute.unimelb.edu.au/__data/assets/pdf_file/0005/5585387/Poverty-Lines-Australia-March-Quarter-2026.pdf).

The source is a Henderson relative poverty-line series. It represents after-tax
income thresholds derived from a 1973 basic-needs benchmark, equivalence scales,
and per-capita household disposable income—not observed expenditure and not
HEM. March 2026 is the latest freely published quarter found before the fixed
demonstration date of 1 October 2026.

## 3. Values

Amounts are Australian dollars. Monthly values are calculated independently as:

`monthly amount = round(weekly source amount × 52 / 12, 2)`

| Workforce status | Household | Dependants | Weekly | Monthly |
| --- | --- | ---: | ---: | ---: |
| In workforce | Single person | 0 | $472.92 | $2,049.32 |
| In workforce | Single parent | 1 | $649.53 | $2,814.63 |
| In workforce | Single parent | 2 | $816.63 | $3,538.73 |
| In workforce | Single parent | 3 | $983.73 | $4,262.83 |
| In workforce | Single parent | 4 | $1,150.83 | $4,986.93 |
| In workforce | Couple | 0 | $687.54 | $2,979.34 |
| In workforce | Couple | 1 | $854.64 | $3,703.44 |
| In workforce | Couple | 2 | $1,021.74 | $4,427.54 |
| In workforce | Couple | 3 | $1,188.84 | $5,151.64 |
| In workforce | Couple | 4 | $1,354.10 | $5,867.77 |
| Not in workforce | Single person | 0 | $340.01 | $1,473.38 |
| Not in workforce | Single parent | 1 | $516.61 | $2,238.64 |
| Not in workforce | Single parent | 2 | $683.71 | $2,962.74 |
| Not in workforce | Single parent | 3 | $850.81 | $3,686.84 |
| Not in workforce | Single parent | 4 | $1,017.92 | $4,410.99 |
| Not in workforce | Couple | 0 | $554.49 | $2,402.79 |
| Not in workforce | Couple | 1 | $721.73 | $3,127.50 |
| Not in workforce | Couple | 2 | $888.83 | $3,851.60 |
| Not in workforce | Couple | 3 | $1,055.93 | $4,575.70 |
| Not in workforce | Couple | 4 | $1,221.18 | $5,291.78 |

The machine-readable source of truth is
[`data/reference/dleb-2026q1.csv`](../data/reference/dleb-2026q1.csv).

## 4. Lookup rules

1. Choose single adult or couple based on the supported household income unit.
2. Choose the dependant count from zero through four.
3. Use `in_workforce` when at least one supported adult is in the workforce;
   otherwise use `not_in_workforce`.
4. For a single adult with dependants, use `single_parent`; for two supported
   adults with dependants, use `couple_with_dependants`.
5. If the household has more than two supported adults, more than four
   dependants, unresolved shared expenses, or uncertain workforce status, return
   `benchmark_unavailable` and refer the application.
6. Do not interpolate, extrapolate, or adjust by state, postcode, or income.

## 5. Affordability use

The adopted general-living-expense amount is:

`max(verified comparable actual monthly expenses, DLEB monthly amount)`

Housing, debt repayments, child support, HELP obligations, and other fixed or
material commitments are assessed separately and added once. Internal transfers
and refunds are excluded from expense totals. The assessment records the DLEB
version and row, verified actual amount, adopted amount, and any review reason.

## 6. Limitations

- DLEB is not HEM and must not be described as lender or industry benchmark data.
- The source measures a relative income poverty line, not actual household
  expenditure or a probability of hardship.
- It is national and has no state, metropolitan, regional, or income adjustment.
- The `max` rule is a conservative demonstration policy, not an Australian legal
  requirement or safe harbour.
- Values do not prove an applicant can reduce higher actual spending without
  hardship.
- Production use would require licensed or independently validated benchmark
  data, legal review, monitoring, version updates, and consumer-specific
  assessment.

## 7. Versioning and review

Accepted fixture assessments retain their benchmark version permanently. Review
the benchmark when a new public poverty-line quarter is adopted; publish a new
version rather than changing this CSV in place. Existing fixture expectations do
not change unless explicitly migrated.
