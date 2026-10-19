# newcredit
A demonstration of a simplified personal-loan application process.

Four working vertical slices implement Scenario A, B, C, and H journeys with a
React web client, Fastify/OpenAPI service, SQLite persistence, and deterministic
assessment fixtures. Every journey starts with an empty, guided document intake:
the demonstrator downloads an applicant-specific synthetic ZIP, then uploads
and processes identity, payslip, and bank-statement evidence one stage at a
time. Extracted values and checks appear after each stage before the next one is
unlocked. The scenarios then cover a new-customer indicative approval, an
existing-customer referral, document review when a statement is missing and a
licence number is unreadable, and a high-risk application that is not approved
and cannot create an offer or funds movement.

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
