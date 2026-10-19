# newcredit
A demonstration of a simplified personal-loan application process.

The React client, Fastify/OpenAPI service and SQLite persistence implement a
document-driven demonstration, not prescribed scenario outcomes. Both new and
existing customers start empty and must supply identity, payslip and statement
evidence. Supported text-PDF layouts are parsed from their contents, including
arbitrary synthetic PDFs outside the supplied packs; extraction is not a hash
allowlist. There is no OCR, identity verification or document-authenticity/fraud
detection. Unsupported layouts and incomplete evidence block submission.

The fixed assessment date is **1 October 2026**: statements must cover every day
of July–September for every account with transactions; payslips paid in
August–September must cover at least eight weeks and be recent at September end.
Unknown and cash transactions require category confirmation, alongside household,
expense, commitment, continuing-income and all-account declarations, contact
details and a specific loan purpose. Outcomes follow evidence and declarations;
the approximate heuristic score is not a calibrated prediction of default.
Packs A, B, C and H are optional samples, not guaranteed journeys. B lacks
identity and is incomplete; older H packs without identity are incomplete too
(the current H manifest includes a licence). There is no existing-customer bypass.

## Run locally

Start with the [step-by-step installation guide](docs/install-and-deployment.md)
for Windows/WSL2 or macOS. It includes prerequisite installation, copy-and-paste
commands, expected output, backups, and troubleshooting. The commands below are
a short reference for an already prepared machine with Node.js 24 and pnpm 12.

```sh
corepack enable
pnpm install --frozen-lockfile
mkdir -p runtime/uploads
export HOST=127.0.0.1
export DATABASE_URL="$PWD/runtime/newcredit.sqlite"
export NEWCREDIT_UPLOAD_DIR="$PWD/runtime/uploads"
pnpm db:migrate
pnpm --filter @newcredit/api dev
```

In a second terminal at the repository root:

```sh
pnpm --filter @newcredit/web exec vite --host 127.0.0.1 --port 5173 --strictPort
```

The web app runs at `http://localhost:5173` and proxies `/api` to the API on
`http://127.0.0.1:3001`. Both commands stay in the foreground; stop them with
Ctrl+C. All application records and documents are synthetic. This runs the
development demo, not an unattended production deployment.

When updating, stop the servers and back up first, then run
`pnpm install --frozen-lockfile` and `pnpm db:migrate` (current SQLite schema: 5).
Old fixture-based drafts must restart as new document-driven applications;
migration does not turn their saved outcomes into evidence-based assessments.
See the installation guide for the complete update and backup procedure.

Useful checks:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm openapi:generate
```

- [Product requirements](docs/requirements.md)
- [Data preparation](docs/data-preparation.md)
- [Application architecture](docs/application-architecture.md)
- [UI design system](docs/ui-design.md)
- [Installation and deployment](docs/install-and-deployment.md)
- [Affordability and credit-risk methodology](docs/affordability-and-risk.md)
- [Demonstration Living Expense Benchmark](docs/living-expense-benchmark.md)
- [Simulated funds disbursement](docs/disbursement.md)
- [Synthetic scenario manifest](data/synthetic/scenario-manifest.csv)
- [OpenAPI 3.1 contract](apps/api/openapi.json)
