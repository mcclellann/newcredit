# Synthetic demonstration data

This directory is reserved for fictional Australian customer and document
fixtures. It must never contain real or merely redacted personal, licence,
payroll, account, or transaction data.

Every committed scenario must include a signed-off provenance declaration under
the [Synthetic Data and Repository Safety Policy](../../docs/synthetic-data-policy.md).

## Fixed periods

- Demonstration date: 1 October 2026
- Bank statements: 1 July–30 September 2026
- Payslips: every pay date from 1 August–30 September 2026
- Currency: AUD

Each customer pack will contain all synthetic accounts with transaction activity
during the statement period. Generated source documents must be internally
consistent with their canonical records except where the scenario deliberately
tests a documented discrepancy.

Run `python3 scripts/generate-synthetic-documents.py` from the repository root to
rebuild every PDF and refresh its SHA-256 manifest value. The generator requires
the packages in `requirements-docs.txt`. Document layouts are source-like but
original, visibly synthetic, and contain no copied logos or security features.

The scenario manifest defines the first eight customer packs. Scenarios A, B,
and C are owner-approved implementation baselines. Scenario C is the deterministic
`needs_review` document-intake baseline: its missing July statement and unreadable
licence number block scoring, outcome, offer creation, and funds movement.

Scenario H is a deterministic, pending-owner-review high-risk baseline for an
existing NT customer. It has complete document periods, sustained negative
external cash flow, high debt service, an unaffordable 19% assessment, no pricing
tier or offer, and no disbursement or ledger movement. Its `review.md` and
provenance deliberately remain `pending_owner_review` until an owner signs off.
