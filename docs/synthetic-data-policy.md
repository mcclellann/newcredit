# Synthetic Data and Repository Safety Policy

**Status:** Approved v1.0

## Rule

Only deliberately authored synthetic data may be committed to this repository.
Real, customer-derived, production, merely redacted, or plausibly identifying
licence, payroll, bank, transaction, contact, address, document metadata, and
account data is prohibited.

This rule applies to source files, generated documents, screenshots, test
fixtures, logs, database files, backups, Git history, issues, and examples.

## Required fixture provenance

Every scenario directory must contain a `provenance.json` declaring:

- that the data was deliberately authored for NewCredit;
- that it was not copied from a real person, account, employer document, or
  financial statement;
- the authoring date and fixed demonstration date;
- reserved or clearly fictional contact and identifier conventions used; and
- the reviewer and review status.

A fixture cannot be marked review-complete without this declaration.

## Safe conventions

- Use generated IDs with `SYN` or fixture-specific prefixes.
- Use `example.com` email domains and Australian fictional phone ranges reserved
  for creative works where available.
- Use clearly fictional street names and do not combine details that plausibly
  identify a real person. A real organisation name may be used only as visual
  context in a fixture that prominently says it is synthetic, unofficial, and
  not issued or endorsed by that organisation; never copy its document, logo,
  identifiers, contact details, or security features.
- Generate licence and account identifiers; display only masked account values.
- Strip creator names, local paths, geolocation, and device metadata from
  generated PDF and image fixtures.
- Put runtime uploads, databases, logs, and backups only in ignored runtime
  directories outside committed fixture paths.

## Consent, retention, and deletion

The demonstration obtains explicit acknowledgement before synthetic document
upload and before application submission. It sends no documents or analytics to
third parties.

Local application data persists until operator deletion or reset. Deleting an
application removes its uploaded files and derived records. A full demonstration
reset also removes associated synthetic audit history. Backups remain subject to
explicit operator deletion and must not be committed.

## Review before commit

Before adding or changing fixture data:

1. confirm the provenance declaration is complete;
2. inspect visible content and document metadata;
3. search staged files for email addresses, phone numbers, account-like numbers,
   local paths, and unsupported document types;
4. confirm balances and expected outputs reconcile;
5. confirm `git status` contains no runtime database, upload, log, or backup; and
6. obtain a second review for ambiguous or risk-relevant labels.

If potentially real data is found, stop. Do not redact it in place or commit a
deletion. Remove it from the worktree and staging area, notify the repository
owner, and follow an approved history-remediation process if it entered a commit.

## Repository controls

`.gitignore` excludes the standard runtime, upload, backup, private-data, and
SQLite paths. These patterns reduce accidental staging but are not a substitute
for review. Implementation must add a staged-content safety check before fixture
generation is considered complete.
