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

The scenario manifest defines the first eight customer packs. Scenario A and B
are the owner-approved implementation baseline; remaining packs follow after the
first vertical slice validates the fixture contract.
