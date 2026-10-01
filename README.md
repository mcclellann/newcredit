# newcredit
A demonstration of a simplified personal-loan application process.

The first working vertical slice implements the approved Scenario A journey with
a React web client, Fastify/OpenAPI service, SQLite persistence, deterministic
assessment fixtures, simulated offer acceptance, and idempotent simulated
funding.

## Run locally

Requires Node.js 24 and pnpm 12.

```sh
corepack enable
pnpm install --frozen-lockfile
mkdir -p runtime
DATABASE_URL=runtime/newcredit.sqlite pnpm db:migrate
pnpm dev
```

The web app runs at `http://localhost:5173` and proxies `/api` to the API on
`http://127.0.0.1:3001`. All application records and documents are synthetic.

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
