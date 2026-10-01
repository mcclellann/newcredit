# Data Preparation Specification

**Status:** Approved v1.0

**Constraint:** Use only deliberately authored synthetic data during development
and demonstration.

## 1. Preparation goals

Prepare a small, traceable dataset that can exercise document extraction,
cross-document checks, application population, transaction classification, and
risk-feature calculation. Expected values must be authored independently of the
future implementation so fixtures can detect incorrect behavior.

No source documents or records containing real personal, bank, licence, or
payroll information should be committed to the repository.
The mandatory controls are defined in the
[Synthetic Data and Repository Safety Policy](synthetic-data-policy.md).

The fixed demonstration date is **1 October 2026**. Therefore:

- bank statements cover 1 July through 30 September 2026;
- every payslip with a pay date from 1 August through 30 September 2026 is
  required; and
- all monetary values use Australian dollars (AUD).

Each fixture includes every synthetic account with transaction activity during
the bank-statement period. Accounts with no activity are outside the initial
demonstration scope.

## 2. Canonical records

| Record | Purpose | Key relationships |
| --- | --- | --- |
| Customer | Stable identity and contact details | Has applications |
| Application | One personal-loan request | Belongs to customer |
| Document | Uploaded source and processing metadata | Belongs to application |
| Extracted field | Value, source location, and confidence | Belongs to document |
| Financial position | Declared or derived income, expense, asset, or liability | Belongs to application |
| Account | Statement account without exposing a full account number | Belongs to customer/application |
| Transaction | Normalized statement line | Belongs to account and source document |
| Classification | Category, confidence, method, and version | Belongs to transaction |
| Document check | Authenticity or consistency signal | Belongs to document/application |
| Risk result | Score, feature values, factors, and version | Belongs to application |
| Living-expense benchmark | Versioned national floor by household composition | Referenced by affordability result |
| Offer | Accepted pricing and repayment terms | Belongs to application |
| Simulated disbursement | Fictional funds-movement record and status | Belongs to accepted offer |
| Audit event | Material action or correction | Belongs to application |

Use generated identifiers throughout. Cross-record relationships should use
those identifiers rather than names, licence numbers, or account numbers.

## 3. Core field dictionary

### Customer and identity

| Field | Type | Rules |
| --- | --- | --- |
| `customer_id` | generated ID | Stable; contains no meaning |
| `customer_type` | enum | `new`, `existing` |
| `legal_name` | structured text | Synthetic; preserve displayed and normalized forms |
| `date_of_birth` | date | Synthetic; applicant must be at least 18 on the demonstration date |
| `email`, `phone` | text | Reserved example domains/numbers only |
| `residential_address` | structured address | Fictional and jurisdiction-specific |
| `licence_number` | sensitive text | New customer only; synthetic and masked in displays |
| `licence_expiry` | date | Must support valid and expired fixtures |
| `existing_customer_reference` | generated ID | Existing customer only |
| `household_type` | enum | Single or couple; required for benchmark lookup |
| `dependant_count` | integer | Zero or greater |
| `benchmark_workforce_status` | enum | `in_workforce` or `not_in_workforce` |
| `housing_status` | enum | Renting, mortgaged, owned, boarding, or other |
| `shared_expense_share` | decimal | Applicant's verified share; do not assume an equal split |

### Application and product

| Field | Type | Rules |
| --- | --- | --- |
| `requested_amount` | decimal | AUD 5,000–100,000 inclusive |
| `requested_term_years` | integer | One of 1, 2, 3, 4, or 5 |
| `loan_purpose` | enum and text | `debt_consolidation`, `vehicle`, `home_improvements`, `medical_dental`, `education`, `major_purchase`, or `other` with explanation |
| `assessment_rate` | decimal | 19% nominal annual rate for initial score calculation |
| `offered_rate` | decimal or null | 12%, 15.5%, or 19% from the pricing tier |
| `monthly_fee` | decimal | AUD 15 |
| `serviceability_buffer` | decimal | 20% of total scheduled monthly obligation |

### Simulated offer and disbursement

| Field | Type | Rules |
| --- | --- | --- |
| `offer_id` | generated ID | One accepted offer per application |
| `accepted_at` | timestamp or null | Fixed fixture time after eligibility |
| `destination_account_id` | generated ID | Applicant-owned synthetic account |
| `destination_bsb_masked` | text | Never expose a complete account identifier |
| `destination_account_masked` | text | Last four digits only |
| `disbursement_id` | generated ID | Unique and idempotent |
| `disbursement_amount` | decimal | Full approved principal in AUD |
| `disbursement_status` | enum | `ready`, `processing`, `completed`, `failed`, `cancelled` |
| `failure_reason` | enum or null | Synthetic operational reason; no sensitive detail |
| `transfer_reference` | text or null | Clearly prefixed `SIM-` |
| `completed_at` | timestamp or null | Present only for successful simulation |

### Documents and extraction

| Field | Type | Rules |
| --- | --- | --- |
| `document_id` | generated ID | Stable within fixtures |
| `document_type` | enum | `drivers_licence`, `payslip`, `bank_statement` |
| `period_start`, `period_end` | date | Required when the document covers a period |
| `page_count` | integer | Positive |
| `content_hash` | text | Used to identify exact duplicate fixtures |
| `processing_status` | enum | `pending`, `processed`, `needs_review`, `failed` |
| `field_name` | text | Canonical destination field |
| `raw_value` | text | Exact synthetic source representation |
| `normalized_value` | typed value | Parsed canonical representation |
| `confidence` | decimal | 0–1; calibration remains to be defined |
| `source_location` | structured reference | Page and bounding region or line reference |

### Financial position

Each entry needs `kind` (`income`, `expense`, `asset`, or `liability`), subtype,
description, amount, currency, frequency where applicable, effective date,
source (`applicant`, `document`, `transaction`, or `customer_record`), and
verification status.

Affordability records also preserve the benchmark version, selected row,
verified comparable actual expenses, adopted amount, and lookup rationale. The
reference values and rules are defined in the
[Demonstration Living Expense Benchmark](living-expense-benchmark.md).

Do not combine recurring flow amounts and point-in-time balances. Preserve the
original frequency, then calculate a separately labelled normalized monthly
amount using one agreed conversion table.

### Approved frequency normalization

| Source frequency | Monthly conversion |
| --- | ---: |
| Weekly | amount × 52 ÷ 12 |
| Fortnightly | amount × 26 ÷ 12 |
| Four-weekly | amount × 13 ÷ 12 |
| Monthly | amount |
| Quarterly | amount ÷ 3 |
| Annual | amount ÷ 12 |

Keep full decimal precision during calculation and round the final monthly value
to cents using half-up rounding. Irregular or unsupported frequencies require an
explicit authored monthly expectation and review; do not infer a recurrence from
one transaction.

### Approved account coverage rules

- Include every account with transaction activity during the statement window.
- Preserve every transaction from a joint account and record ownership plus the
  applicant's confirmed income and expense share separately.
- Include an account opened or closed during the window with its true available
  dates; explained partial coverage does not itself fail completeness.
- Pair confirmed internal transfers across supplied accounts and exclude both
  sides from income and expense totals.
- Do not assume an unpaired transfer, cash withdrawal, or merchant name proves
  the purpose of funds.

## 4. Normalized transaction schema

| Field | Type | Rules |
| --- | --- | --- |
| `transaction_id` | generated ID | Stable and non-identifying |
| `account_id` | generated ID | References a synthetic account |
| `source_document_id` | generated ID | Traceable to statement and page/line |
| `posted_date` | date | Required |
| `value_date` | date or null | Preserve if supplied |
| `raw_description` | text | Exact synthetic statement text |
| `normalized_merchant` | text or null | Must not replace raw text |
| `amount` | decimal | Positive magnitude |
| `direction` | enum | `credit`, `debit` |
| `currency` | ISO currency code | `AUD` for the initial fixture set |
| `balance_after` | decimal or null | Used for reconciliation when available |
| `category` | taxonomy value | One value, including `unknown` |
| `classification_confidence` | decimal | 0–1 |
| `classification_method` | text | Rule/model and version |
| `is_internal_transfer` | boolean | Excluded from income/expense totals when confirmed |
| `is_recurring` | boolean | Derived with method/version |

Amounts must use decimal representations, not binary floating point. Keep debit
and credit direction separate from amount to avoid inconsistent sign handling.

## 5. Transaction taxonomy

The initial mutually exclusive top-level categories are:

- `income.salary`
- `income.benefit`
- `income.other`
- `transfer.internal`
- `transfer.external`
- `expense.housing`
- `expense.utilities`
- `expense.groceries`
- `expense.transport`
- `expense.insurance`
- `expense.healthcare`
- `expense.education_childcare`
- `expense.debt_repayment`
- `expense.bnpl_repayment`
- `expense.short_term_credit_repayment`
- `expense.child_support`
- `expense.gambling`
- `expense.cash_withdrawal`
- `expense.bank_fee`
- `expense.dishonour_fee`
- `expense.overdraft_fee`
- `expense.discretionary`
- `expense.other`
- `refund`
- `unknown`

This taxonomy is approved for the initial fixtures. Labelling rules must define
ambiguous cases before labels are produced. In
particular, distinguish salary from other credits, debt repayments from ordinary
transfers, refunds from income, and internal transfers from genuine cash flow.
Merchant details may support classification but must not be treated as proof of
the purpose of a transaction.

## 6. Labelling package

For each fixture, prepare:

1. source-like synthetic documents;
2. canonical extracted fields with page/line provenance;
3. normalized transactions;
4. independently authored transaction labels;
5. expected monthly financial summaries;
6. expected document-check signals and conflicts;
7. expected risk features; and
8. expected processing and credit outcomes, with reasons; and
9. expected offer and simulated-disbursement events for eligible scenarios.

Each transaction label should include category, annotator rationale, ambiguity
flag, and an allowed alternative when the evidence genuinely supports more than
one category. A second review is required for ambiguous and risk-relevant labels.

## 7. Candidate transaction-derived risk features

These are candidates for product review, not approved decision factors:

- verified regular income and income volatility;
- recurring essential and discretionary expenditure;
- recurring debt repayments;
- net monthly cash flow;
- days or periods with a negative balance;
- returned payments and bank fees;
- end-of-period balance trend;
- expense-to-income and debt-service-to-income ratios;
- gambling frequency and share of verified net income;
- short-term credit, BNPL, dishonours, and reversed payments;
- unexplained large credits or debits; and
- completeness, coverage, and classification uncertainty.

Features must define their time window, missing-data behavior, treatment of
internal transfers, minimum confidence, and calculation formula. Keep document
integrity signals separate from affordability features unless an approved policy
explicitly combines them.

## 8. Minimum synthetic scenario set

| Scenario | Customer | State/territory | Purpose | Expected outcome |
| --- | --- | --- | --- | --- |
| A | New | NSW | Complete documents, regular salary, stable positive cash flow | Indicatively approved |
| B | Existing | VIC | Pre-populated details, variable income, recurring liabilities | Referred |
| C | New | QLD | Missing statement period and unreadable licence field | Withheld pending review |
| D | Existing | SA | Duplicate statement page and cross-document income conflict | Withheld pending review |
| E | New | WA | Internal transfers and refunds that must not inflate income | Indicatively approved |
| F | Existing | TAS | Ambiguous merchants, cash transactions, and `unknown` labels | Referred |
| G | New | ACT | Suspicious alteration signals requiring review, not an automatic fraud conclusion | Withheld pending review |
| H | Existing | NT | Complete documents, sustained negative cash flow, and high debt servicing | Not approved |

The machine-readable version is the
[synthetic scenario manifest](../data/synthetic/scenario-manifest.csv).

Each scenario needs enough asymmetric values to expose swapped dates, debit and
credit inversion, duplicate counting, incorrect frequency conversion, and
internal-transfer double counting.

## 9. Quality checks

- Required identifiers are unique and references resolve.
- Document periods are continuous and match the expected scenario.
- Statement opening balance plus credits minus debits equals closing balance,
  subject to a documented tolerance.
- Payslip totals reconcile to gross pay, deductions, and net pay.
- Expected summaries are derived independently and reconcile to labelled rows.
- Every transaction has one category or `unknown` and classification metadata.
- Internal transfers have paired evidence where possible.
- Fixture corrections retain both extracted and corrected values.
- Synthetic PII cannot accidentally identify a real person or account.
- Dates are relative to a documented fixed demonstration date so fixtures remain
  deterministic.
- Every active synthetic account is represented for July through September 2026.
- Expected credit outcomes include independently authored reason codes.
- Completed disbursements equal the accepted principal and have one unique
  `SIM-` reference.
- Ineligible, unaccepted, failed, or cancelled disbursements have no completed
  funds-movement event.
- Replaying an accepted-offer fixture does not create a second disbursement.

## 10. Data-readiness gate

Implementation should not begin until:

1. ~~the taxonomy and financial normalization rules are approved~~ — completed;
2. ~~scenario A and B source records and expected outputs are reviewed~~ —
   completed; and
3. ~~the repository has an explicit policy preventing real sensitive documents
   from being committed~~ — completed.

All data-readiness gates were completed on 1 October 2026. The fixture set is
ready to drive implementation and tests.
