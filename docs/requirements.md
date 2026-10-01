# Personal Loan Demonstration — Product Requirements

**Status:** Draft v0.2  
**Purpose:** Establish the product boundary before implementation.

## 1. Product objective

Demonstrate a simplified personal-loan application that:

1. supports new and existing customers;
2. collects the documents needed for an application;
3. extracts identity and financial information from those documents;
4. checks documents for indicators of alteration or inconsistency;
5. asks the applicant to verify extracted information before submission;
6. classifies every bank-statement transaction;
7. produces an explainable risk score using transaction-derived information;
8. shows an indicative application outcome; and
9. simulates offer acceptance and funds disbursement for eligible applications.

This is a demonstration, not a production lending or identity-verification
system. It must use fictional or properly de-identified data. Its document
checks, risk score, outcome, offer, and funds movement must not be represented as
definitive fraud findings, a real offer of credit, or a real payment.

## 2. Users

### Applicant

- Starts a new application.
- Identifies as a new or existing customer.
- Supplies required documents.
- Reviews and corrects extracted information.
- Verifies the completed application and submits it.

### Demonstration operator

- Can inspect processing status, extracted information, document-check results,
  transaction classifications, and risk factors.
- Can understand why an application was flagged or assigned a score.

An underwriter or administrator workflow is outside the initial scope unless a
human review step is later required.

## 3. Applicant journeys

### 3.1 New customer

1. Start an application and select **New customer**.
2. Upload a photograph or copy of a driver's licence.
3. Upload two months of payslips.
4. Upload bank statements covering three months.
5. Wait while documents are validated, checked, and extracted.
6. Review the populated application, transaction summary, and any fields that
   need attention.
7. Correct permitted fields and confirm that the information is accurate.
8. Submit the application.
9. View an indicative outcome and its principal reasons.
10. If eligible, review and accept a simulated offer, confirm the masked
    destination account, and view simulated funding confirmation.

### 3.2 Existing customer

1. Start an application and select **Existing customer**.
2. Sign in through a simulated demonstration login.
3. Load known customer details and ask the applicant to confirm them.
4. Upload two months of payslips.
5. Upload bank statements covering three months.
6. Complete processing, review, correction, verification, submission, and
   outcome display as for a new customer.

Existing customers do not upload a driver's licence in the initial scope.
The simulated login uses only synthetic credentials and does not represent a
production authentication design.

## 4. Functional requirements

### 4.1 Application management

- Each application has a unique identifier and is associated with one customer.
- An in-progress application can distinguish new from existing customers.
- The applicant can request an amount from AUD 5,000 through AUD 100,000,
  inclusive.
- The applicant can request a term of 1, 2, 3, 4, or 5 years.
- The indicative annual interest rate is risk-based at 12%, 15.5%, or 19%, with
  an AUD 15 monthly fee.
- Processing status is visible: draft, documents required, processing, review
  required, ready to submit, submitted, or processing failed.
- Submission is blocked until required documents and confirmations are present.

### 4.2 Document collection

- New customers must provide one driver's licence image or document.
- Every applicant must provide all payslips dated in the latest two complete
  calendar months.
- Every applicant must provide statements for the latest three complete calendar
  months from every account with transaction activity during that period.
- Accepted file formats, size limits, and page limits remain to be decided.
- The application identifies missing periods, unreadable pages, duplicate
  uploads, and unsupported files.

### 4.3 Document checks and extraction

- Preserve the source document and its relationship to extracted fields.
- Record document type, stated issuer, covered period, processing status, and
  extraction confidence.
- Check for indicators such as metadata anomalies, visual alteration,
  inconsistent totals, duplicate pages, implausible dates, and conflicts across
  documents.
- Report checks as signals: passed, needs review, failed, or unavailable.
- Extract identity, employment, income, account, balance, and transaction data
  where present.
- Low-confidence or conflicting values must be highlighted for applicant or
  operator review; they must not silently overwrite trusted customer data.

### 4.4 Customer and financial information

The populated application must support:

- **Customer:** legal name, date of birth, contact details, residential address,
  driver's licence details for a new customer, and customer identifier for an
  existing customer.
- **Employment and income:** employer, employment status, pay frequency, gross
  pay, net pay, regular income, and other income.
- **Expenses:** housing, utilities, food, transport, insurance, dependants,
  discretionary spending, debt servicing, and other recurring expenses.
- **Assets:** asset type, description, stated value, ownership, and data source.
- **Liabilities:** creditor, liability type, outstanding balance, repayment,
  frequency, and data source.

Values may be applicant-declared, document-extracted, transaction-derived, or
loaded from an existing customer record. The source and verification status of
each material value must remain visible.

### 4.5 Applicant verification

- Present extracted and pre-populated values in a reviewable application.
- Clearly identify fields with low confidence, conflicts, or missing values.
- Permit corrections while retaining the original extracted value and an audit
  record of the change.
- Obtain an explicit applicant confirmation immediately before submission.

### 4.6 Transaction classification

- Extract each transaction from every submitted bank statement.
- Normalize date, description, debit/credit direction, amount, currency, and
  account reference.
- Assign every transaction one category, a confidence value, and a
  classification method or model version.
- Support an `unknown` category rather than forcing unsupported certainty.
- Detect likely internal transfers so they are not double-counted as income or
  expense.
- Preserve the original transaction text for traceability.

The initial category vocabulary is defined in
[Data preparation](data-preparation.md#5-transaction-taxonomy).

### 4.7 Affordability, risk score, and outcome

- Perform a separate affordability assessment using verified income, actual
  expenses, liabilities, the proposed repayment, and the project's Demonstration
  Living Expense Benchmark.
- Use the benchmark as a plausibility and serviceability input, not as a
  substitute for applicant-specific inquiries and verification.
- Record whether the proposed loan is affordable, marginal, or unaffordable and
  show the values and assumptions used.
- Produce a demonstration risk score from documented transaction-derived
  features.
- Show the principal factors affecting the score and the data periods used.
- Keep raw features and score version so a result can be reproduced.
- Exclude protected characteristics and identity-document attributes from score
  calculation.
- Treat missing or uncertain data explicitly rather than silently as adverse.
- Express credit risk on a 1–1000 scale where a higher score means higher risk.
- Map a completed synthetic application to one of three demonstration outcomes:
  `indicatively approved`, `referred`, or `not approved`.
- Withhold the credit outcome when required information is incomplete or a
  document needs review.
- Show outcome reasons separately from document-integrity signals.
- Label every outcome as illustrative and not an offer of credit.

The complete calculation, bands, and outcome rules are defined in
[Affordability and credit-risk methodology](affordability-and-risk.md). Benchmark
values and lookup rules are defined in the
[Demonstration Living Expense Benchmark](living-expense-benchmark.md).

### 4.8 Simulated offer and funds disbursement

- Only an `indicatively approved` application can proceed directly to a
  simulated offer. A referred application must first receive a recorded
  demonstration-operator approval.
- Show the approved principal, term, nominal annual rate, monthly fee, repayment,
  total repayable, and prominent simulation disclaimer before acceptance.
- Require explicit acceptance of the simulated offer and confirmation of a
  masked destination account owned by the synthetic applicant.
- Restrict the destination to an account represented in the submitted or
  pre-populated synthetic customer data.
- Simulate disbursement of the full approved principal in AUD. The monthly fee is
  not deducted from the disbursed amount.
- Generate a unique simulated transfer reference and record statuses of ready,
  processing, completed, failed, or cancelled.
- Make each accepted offer idempotent: retries cannot create a second successful
  disbursement.
- Support a safe retry after a simulated operational failure without changing
  the accepted offer terms.
- Display a persistent **Simulation only—no money was transferred** notice on
  every offer, processing, and confirmation screen.

The complete flow and record requirements are defined in
[Simulated funds disbursement](disbursement.md).

## 5. Non-functional requirements

- Use synthetic data throughout the public demonstration.
- Localize the demonstration for Australia, with AUD amounts, Australian
  addresses, and state or territory driver's licence examples.
- Encrypt sensitive data in transit and at rest if real data is ever introduced.
- Restrict document and application access by role.
- Maintain an audit trail for uploads, extraction, corrections, checks, scoring,
  confirmation, submission, offer acceptance, and simulated disbursement.
- Explain uncertainty and failure; do not label a document "fake" solely from
  an automated signal.
- Meet WCAG 2.2 Level AA for the web interface.
- Avoid logging document contents or personally identifiable information.
- Obtain Australian legal and compliance review before presenting any workflow,
  score, or outcome as suitable for real lending.
- Support deployment on either a local Windows host through WSL2 or a local
  macOS host. Neither target requires an inbound public IP address.
- Expose the application only through the configured reverse proxy or outbound
  tunnel. API, worker, and database ports must not be publicly reachable.

## 6. Initial acceptance criteria

A demonstration is complete when:

1. one new-customer fixture and one existing-customer fixture can complete their
   respective journeys;
2. required document periods are validated;
3. the review step shows extracted values and their sources;
4. applicant corrections preserve original values;
5. every extracted transaction has a category or `unknown`, confidence, and
   traceable source;
6. income, expense, asset, and liability summaries reconcile to their source
   data within defined tolerances;
7. a versioned risk result lists its input period and contributing factors;
8. suspicious, unreadable, incomplete, and conflicting document fixtures enter
   a visible review state rather than silently succeeding; and
9. synthetic scenarios demonstrate an indicative approval, referral, and
   not-approved outcome with understandable reasons; and
10. an eligible fixture can accept an offer and complete exactly one simulated
    disbursement, while blocked and failed scenarios cannot create funds movement;
    and
11. tested installation and service-start instructions work from clean checkouts
    on both Windows/WSL2 and the supported macOS baseline.

## 7. Confirmed product decisions

1. The demonstration is localized for Australia.
2. It shows an indicative outcome after submission.
3. Existing-customer login is simulated.
4. Document periods use the latest complete calendar months.
5. Statements cover every account with transactions during the required period.
6. Example customers and documents are entirely synthetic.
7. Approved funding is simulated; the demonstration never connects to payment
   rails or transfers real money.
8. The living-expense benchmark uses the March 2026 Henderson poverty-line
   amounts excluding housing, converted from weekly to monthly values.
9. Supported deployment targets are a local Windows machine running WSL2 and a
   native macOS machine, each behind a proxy without a directly reachable public
   address.

## 8. Decisions still required before implementation

1. Loan purpose and any additional eligibility fields to collect.
2. Which synthetic customer details are pre-populated after simulated login.
3. How joint accounts and accounts opened or closed during the period are
   represented.
4. Supported document formats and whether extraction/checking uses a real
   provider, a local model, or deterministic demonstration fixtures.
5. Transaction categories that must be separated for the intended audience.
6. Retention, consent, deletion, accessibility, and audit requirements.
