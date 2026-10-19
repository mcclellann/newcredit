# Affordability and Credit-Risk Methodology

**Status:** Implemented demonstration methodology; not a production risk model

**Scope:** Synthetic Australian personal-loan demonstration only

## 1. Important distinction

The demonstration produces two separate results:

1. **Affordability assessment:** whether the applicant appears able to meet the
   proposed obligations without substantial hardship, based on their individual
   verified circumstances.
2. **Credit-risk score:** an explainable heuristic ranking from 1 to 1000 based
   on observed transaction and debt behaviour.

A good risk score cannot override failed affordability. A failed or incomplete
document check withholds both results until review. The score is not calibrated
to a probability of default because the demonstration has no representative
historical performance data.

### Implemented evidence contract

Applications start empty on both customer paths; simulated existing-customer
login does not replace identity evidence. The fixed assessment date is
**1 October 2026**. Every account with transactions needs complete daily statement
coverage for **1 July–30 September 2026**, without overlapping periods and with
consistent adjoining balances. Payslips paid in **August–September 2026** must
cover at least 56 non-overlapping pay-period days and be recent at September end
within the supported weekly, fortnightly or monthly cadence.

Supported text PDFs are parsed from their contents, including arbitrary synthetic
documents in supported layouts, rather than an approved-hash allowlist. There is
no OCR, document authenticity/fraud detection or external identity verification.
Checks cover required fields, dates, cross-document names, identity age/expiry,
pay arithmetic and statement reconciliation; they do not prove genuine evidence.
Packs A/B/C/H are optional samples, not outcome selectors. B lacks identity and
is incomplete; older H packs without identity are incomplete too (the current H
manifest includes a licence). Neither path bypasses that requirement.

Submission requires confirmed household, expenses, commitments and loan details,
all-account and continuing-income declarations, contact details and specific
purpose. Non-empty foreseeable changes other than “none” require review.
Unknown/cash transactions must all be classified, even below the domain's
AUD 100/month materiality threshold. Payslip and statement salary amounts must
reconcile within 20%; income used is the lower of normalized payslip income and
average statement salary credits, with salary required in each observed month.
Old fixture-based drafts must restart; schema 5 preserves legacy records but
does not convert them into document-driven assessments. Updating requires
`pnpm install --frozen-lockfile` and `pnpm db:migrate` after backup.

## 2. Product boundary

- Minimum request: AUD 5,000
- Maximum request: AUD 100,000
- Product: personal loan
- Term: 1–5 years in whole-year increments
- Repayment frequency: monthly for the initial demonstration
- Risk-based nominal annual rates: 12%, 15.5%, or 19%
- Monthly fee: AUD 15
- Serviceability buffer: 20% of the total scheduled monthly obligation

The requested amount must be evaluated with the actual proposed term, rate,
fees, and repayment—not with the amount alone.

## 3. Responsible-lending basis

The responsible-lending requirements motivating the demonstration include:

- the applicant's requirements and objectives, including a specific loan
  purpose;
- verified amount, frequency, source, stability, and expected continuation of
  income;
- actual fixed, variable, essential, and discretionary expenses;
- liabilities, limits, repayments, BNPL, child support, HELP obligations, and
  other commitments where relevant;
- household composition, dependants, housing, and the applicant's substantiated
  share of joint expenses;
- reasonably foreseeable changes during the proposed term;
- assumptions about any spending reduction, confirmed by the applicant; and
- evidence sources, inconsistencies, corrections, and assessment reasons.

This follows ASIC's current description of responsible lending: make reasonable
inquiries into financial circumstances and requirements and objectives, take
reasonable verification steps, and assess whether the contract is not
unsuitable. It is a product requirement, not legal advice or a statement that
the demonstration satisfies Australian law. The implemented declaration and
extraction gates above are narrower than a production verification process:
there are no bureau, merchant-verification or authenticity checks, automated
substantiation of joint expense shares, or full foreseeable-change modelling.

## 4. Demonstration Living Expense Benchmark

The project uses a versioned public proxy because current HEM tables are not
project-owned data. DLEB v1 uses the Melbourne Institute's published March 2026
Henderson poverty-line amounts **other than housing**, selected by:

- single or couple household;
- zero to four dependants; and
- whether at least one supported adult is in the workforce.

The Melbourne Institute's current HEM values are available only through a
Perpetual subscription; its public pages describe the methodology but do not
publish the dollar table. No legitimate, current, publicly downloadable HEM
table was found during research on 1 October 2026. Unless the project obtains a
licence, its benchmark must be named **Demonstration Living Expense Benchmark**
and must not be presented as HEM data.

DLEB is national and is not adjusted by income or location. Verified actual
expenses retain priority whenever they are higher. Unsupported household types,
including more than four dependants, require review rather than extrapolation.

The proxy covers general living expenses only. Housing, existing debt
repayments, child support, HELP obligations, and other material items excluded
from the selected benchmark definition are assessed separately.

For this conservative demonstration policy:

`assessed general living expenses = max(verified actual general living expenses, Demonstration Living Expense Benchmark)`

This maximum rule is a project policy, not a statement that Australian law
requires HEM to be a minimum. A production assessment would need to consider
verified lower actual expenses and the applicant's specific circumstances.

The complete source table, conversion, lookup rules, and limitations are in the
[Demonstration Living Expense Benchmark](living-expense-benchmark.md).

## 5. Monthly affordability calculation

Payslip frequencies are retained at source and normalized using weekly × 52/12,
fortnightly × 26/12 and monthly × 1, then averaged. Statement amounts are
aggregated over the three-month observation window.

Implemented living expenses are the maximum of declared living expenses, DLEB,
and observed monthly living + cash + unknown debits + gambling + payment-stress
debits. Housing and debt each use the greater of declared and observed amounts;
short-term-credit repayments are included in debt. Other declared commitments
are added separately. Only one-to-one same-day equal/opposite transactions
labelled “transfer” on both sides across distinct uploaded accounts are excluded
as internal transfers; unknown counterparties are not assumed internal.

`assessed outgoings = assessed general living expenses + housing + existing debt repayments + other fixed commitments`

`post-loan surplus = verified net income - assessed outgoings - stressed proposed repayment`

`surplus ratio = post-loan surplus / verified net income`

For principal `P`, monthly rate `r`, and `n` monthly repayments, the scheduled
principal-and-interest repayment uses the standard amortizing-loan formula:

`repayment = P × r × (1 + r)^n / ((1 + r)^n - 1)`

`scheduled monthly obligation = repayment + AUD 15 monthly fee`

`stressed proposed repayment = scheduled monthly obligation × 1.20`

The 20% buffer increases the total monthly obligation; it does not add 20
percentage points to the annual interest rate.

### Affordability bands

| Result | Rule | Demonstration treatment |
| --- | --- | --- |
| Affordable | Surplus is at least both AUD 300 per month and 5% of verified net income | May proceed to credit-risk outcome |
| Marginal | Surplus is non-negative but below either buffer | Refer for review |
| Unaffordable | Surplus is negative | Not approved |
| Undetermined | Required data is missing, conflicting, or under document review | Withhold outcome |

The AUD 300 and 5% buffers are transparent demonstration policy assumptions,
not regulatory safe harbours.

## 6. Credit-risk score

The score runs from **1 (lowest observed risk) to 1000 (highest observed risk)**.
It is calculated only when required inputs are complete.

Each factor receives a risk value of 0, 25, 50, 75, or 100. The weighted factor
values produce a composite risk value from 0 to 100:

| Factor | Weight | Primary evidence |
| --- | ---: | --- |
| Post-loan capacity | 25% | Affordability surplus ratio |
| Payment stress | 20% | Dishonours, reversed payments, arrears, overdraft fees |
| Existing debt burden | 15% | Debt repayments as a share of verified net income |
| Cash-flow and balance stability | 15% | Monthly net cash flow and observed negative-balance transaction dates |
| Income stability | 10% | Monthly salary range divided by maximum monthly salary |
| Gambling activity | 10% | Classified gambling debits as income share and frequency |
| Short-term credit use | 5% | Payday, wage-advance, and BNPL repayment events |

`score = clamp(round(1 + 9.99 × composite risk), 1, 1000)`

### Factor thresholds

| Risk value | Capacity: surplus ratio | Debt repayments / net income | Payment-stress events in 3 months | Negative-balance behaviour | Monthly salary variation | Gambling / net income | Short-term credit events |
| ---: | --- | --- | --- | --- | --- | --- | ---: |
| 0 | ≥20% | ≤10% | 0 | 0 days and positive cash flow each month | <5% | 0% and 0 events | 0 |
| 25 | 10–<20% | >10–20% | 1 | 1–3 days or one flat month | 5–<10% | >0–1% or 1–2 events | 1 |
| 50 | 5–<10% | >20–30% | 2 | 4–10 days or one negative month | 10–<20% | >1–3% or 3–5 events | 2 |
| 75 | 0–<5% | >30–40% | 3–4 | 11–20 days or two negative months | 20–<35% | >3–7% or 6–10 events | 3 |
| 100 | <0% | >40% | ≥5 | >20 observed dates or all three months negative | ≥35% | >7% or >10 events | ≥4 |

“Days” in this table means distinct observed transaction dates with a negative
balance, not reconstructed daily balances. Monthly salary variation is an
approximation affected by pay-cycle timing, not pay-cycle-normalized volatility.
Non-continuing income is a submission gate, not an added score penalty. Counts
and negative months/dates are normalized to three months in the domain function.
These implemented signals are approximate description-based heuristics, not
validated production measures or calibrated risk prediction.

For a factor with two tests, use the higher risk value. Gambling activity means
transactions positively classified as gambling; ordinary cash withdrawals are
not assumed to be gambling. Cash withdrawals remain outgoings for affordability,
and material unexplained cash use triggers review rather than automatic adverse
points. Unknown or low-confidence classifications also trigger review and never
silently increase the score.

## 7. Score bands

| Score | Label | Interpretation |
| ---: | --- | --- |
| 1–199 | Very low | Strong verified capacity and no material observed stress indicators |
| 200–399 | Low | Generally stable, with limited risk indicators |
| 400–599 | Moderate | Mixed indicators that warrant closer assessment |
| 600–749 | Elevated | Multiple or material indicators of repayment risk |
| 750–899 | High | Serious capacity or payment-stress indicators |
| 900–1000 | Severe | Highest heuristic stress band; no measured default probability |

No band is labelled “will default.” Default is never certain, and these labels
do not estimate a real probability of default. Calibration would require a
representative historical dataset, defined default outcome, observation window,
validation, bias testing, and ongoing monitoring.

## 8. Risk-based pricing

The post-loan capacity factor creates a potential circular dependency: the rate
depends on the score, while capacity depends on the repayment at that rate. The
demonstration resolves this conservatively:

1. Calculate the score and initial affordability at the maximum 19% annual rate,
   including the monthly fee and 20% buffer.
2. Assign the pricing tier from that frozen score.
3. Recalculate final affordability at the offered tier rate, still including the
   monthly fee and 20% buffer.
4. Preserve both calculations and do not rescore at the lower offered rate.

| Frozen score | Pricing tier | Nominal annual rate | Availability |
| ---: | --- | ---: | --- |
| 1–199 | Tier 1 | 12% | Available if affordable |
| 200–399 | Tier 2 | 15.5% | Available if affordable |
| 400–749 | Tier 3 | 19% | Requires referral and affordability |
| 750–1000 | No offer | — | Not approved |

The monthly fee means the effective cost is higher than the nominal rate. The
demonstration must display the rate, fee, term, repayment, and total repayable;
it must not label the nominal rate as a comparison rate.

## 9. Demonstration outcome mapping

Apply rules in this order:

1. Missing, conflicting, unsupported or unreconciled required evidence, or
   unconfirmed declarations/classifications → **outcome withheld**. This does
   not imply implemented fraud/authenticity detection.
2. Unaffordable → **not approved** regardless of score.
3. Marginal affordability → **referred** regardless of score.
4. Affordable and score 1–399 → **indicatively approved**.
5. Affordable and score 400–749 → **referred**.
6. Affordable and score 750–1000 → **not approved**.

Every result shows the affordability calculation, score version, band, three
largest adverse factors, material positive factors, and plain-language reasons.
Extraction/reconciliation issues are submission blockers, not score points or
proof of document integrity. The legacy domain result represents review-held
results as `referred` with `riskScore: 0` and no factors; zero is a sentinel,
not low risk, and the API withholds submission/outcome while blockers remain.
Marginal non-negative surplus also maps to `referred`; the legacy affordability
field says `affordable`, so reasons and buffer checks distinguish marginal cases.
High-score/negative-surplus results may include illustrative calculations but
cannot create an offer. None of these results predicts that an applicant will
default.

## 10. References

- [ASIC: Responsible lending](https://asic.gov.au/regulatory-resources/credit/responsible-lending)
- [ASIC Regulatory Guide 209: Credit licensing—Responsible lending conduct](https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-209-credit-licensing-responsible-lending-conduct/)
- [Melbourne Institute: Household Expenditure Measure quarterly updates](https://melbourneinstitute.unimelb.edu.au/research/family-and-labour-economics/projects/2012/household-expenditure-measure-quarterly-updates)
- [Melbourne Institute: Poverty Lines Australia, March quarter 2026](https://melbourneinstitute.unimelb.edu.au/__data/assets/pdf_file/0005/5585387/Poverty-Lines-Australia-March-Quarter-2026.pdf)
- [ABS: Household Expenditure Survey 2015–16](https://www.abs.gov.au/statistics/economy/finance/household-expenditure-survey-australia-summary-results/latest-release)

References checked 1 October 2026. RG 209 explains that benchmarks can support
plausibility checking but do not themselves provide information about an
individual consumer or replace reasonable inquiries and verification.
