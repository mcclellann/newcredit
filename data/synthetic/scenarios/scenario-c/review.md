# Scenario C review

**Status:** Owner approved on 2 October 2026 as the implementation baseline. All records and documents are synthetic demonstration data; this is not an external compliance review or signed attestation.

Casey Fiction is a new QLD customer with one sole transaction account and complete August–September payslips. The account is active throughout the required 1 July–30 September 2026 window, but only August and September statements are supplied. The synthetic driver licence deliberately obscures its licence-number field.

## Expected result and blocking signals

- Processing state: **`needs_review`**.
- `documents/check-results.json` reports `required_statement_coverage` as `needs_review`, with 1–31 July 2026 in `missing_periods` for `ACCT-SYN-C1`.
- The same file reports the `licence_number` `field_readability` check as `needs_review`; `documents/extracted-fields.json` preserves `[UNREADABLE]`, a null normalized value, low confidence, source location, and `review_required: true`.
- Present statements and payslips may be extracted and classified, but incomplete coverage means they cannot drive affordability or risk decisions.

## Integration contract and invariants

The processor consumes `documents/manifest.json` for uploaded documents and statuses, `documents/check-results.json` for both blockers, and `documents/extracted-fields.json` for field-level provenance. `canonical/accounts.json` provides required versus available account coverage; `transactions/normalized.csv` and `labels/transaction-labels.csv` contain only rows traceable to the supplied August and September statements. Expected assertions are in `expected/risk-result.json` and `expected/events.json`.

While either blocker remains, the processor must not submit or score the application: score, band, pricing tier, offered rate, affordability result, and credit outcome remain null/withheld. It must create no offer, disbursement, transfer reference, or ledger entry. No funds movement is simulated.
