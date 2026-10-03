# Application Architecture

**Status:** Approved v1.2

**Scope:** Synthetic personal-loan demonstration with a future native iOS client

## 1. Recommendation

Build an API-first TypeScript monorepo:

| Layer | Language and libraries | Purpose |
| --- | --- | --- |
| Web UI | TypeScript, React, Vite | Responsive applicant and demonstration-operator experience |
| UI data and forms | TanStack Query, React Router, React Hook Form, Zod | Server state, navigation, field validation, and accessible error handling |
| UI styling | Tailwind CSS, Radix UI primitives, Lucide icons | A small, accessible design system without coupling to a hosted component service |
| HTTP API | TypeScript, Node.js active LTS, Fastify | Versioned REST API independent of the web client |
| API schemas | TypeBox, Fastify type provider, `@fastify/swagger` | Runtime validation, TypeScript types, and generated OpenAPI |
| Persistence | SQLite, Drizzle ORM, `better-sqlite3`, Drizzle Kit | Relational records, constraints, transactions, and migrations |
| Generated clients | `openapi-typescript` for web; Swift OpenAPI Generator for future iOS | Clients generated from the same published contract |
| Tests | Vitest, React Testing Library, Playwright | Domain, API, component, and journey coverage |

Use the current stable major versions when implementation starts and commit the
package-manager lockfile. Pin the Node.js and pnpm versions so local and orb
environments are reproducible.

## 2. Why this stack

### TypeScript and Fastify

TypeScript provides one language for the initial team without making the API a
web-only backend. Fastify has first-class request/response schemas, efficient
multipart handling, dependency injection through plugins, and in-process HTTP
testing. It is a stronger fit than an unstructured Express application for an
API that must remain usable by independently released clients.

Fastify route schemas are the implementation source for runtime validation.
They generate a committed OpenAPI document in CI. The generated document is the
external compatibility contract; a build fails if it is stale or contains an
unreviewed breaking change.

### React and Vite

This is an authenticated-style application flow, not a search-indexed content
site. A Vite single-page application keeps the web deployment simple and forces
all product behaviour through the public API. It avoids adding a server-rendering
framework or a web-only backend-for-frontend that a future iOS client could not
use.

### SQLite and Drizzle

SQLite is appropriate for one demonstration instance and offers real foreign
keys, unique constraints, and atomic transactions. Drizzle stays close to SQL,
generates reviewable migrations, and adds compile-time query types without
hiding database behaviour behind a large runtime.

SQLite is not proposed as a horizontally scaled production lending database.
The repository boundary should avoid SQLite-specific SQL where practical so a
later PostgreSQL migration changes infrastructure rather than API contracts or
business rules.

## 3. System shape

```text
┌──────────────────┐       HTTPS / JSON       ┌────────────────────┐
│ React web client │─────────────────────────▶│ Fastify API        │
└──────────────────┘                          │ /api/v1            │
                                              └──────┬─────────────┘
┌──────────────────┐       same contract             │
│ Future iOS app   │─────────────────────────▶       │ use cases
│ generated Swift  │                                 ▼
│ API client       │                          ┌────────────────────┐
└──────────────────┘                          │ Domain services    │
                                              │ and policy engines │
                                              └──────┬─────────────┘
                                                     │ repositories
                                                     ▼
                                              ┌────────────────────┐
                                              │ SQLite + local     │
                                              │ synthetic files    │
                                              └────────────────────┘
```

The browser never reads SQLite or fixture files directly. All clients see the
same authorization boundary, validation, state transitions, calculations, and
error model through `/api/v1`.

## 4. Repository layout

```text
apps/
  api/                 Fastify routes, use cases, repositories, worker
  web/                 React application
packages/
  api-client/          generated TypeScript client; never hand-edited
  domain/              pure affordability, score, pricing, and state rules
  test-fixtures/       typed loaders for independently authored synthetic data
openapi/
  openapi.json         generated and committed external contract
data/
  reference/           versioned policy reference tables
  synthetic/           synthetic source and expected-result fixtures
```

Use pnpm workspaces. Keep modules private until sharing is required; do not
create a package for every record type.

## 5. API design

### Contract rules

- REST over HTTPS with JSON under `/api/v1`.
- OpenAPI 3.1 generated from validated route schemas and committed.
- Resource identifiers are opaque strings; clients must not infer meaning.
- Dates are ISO 8601 calendar dates and timestamps are UTC RFC 3339 strings.
- Monetary values cross the API as integer minor units such as
  `{ "amountMinor": 500000, "currency": "AUD" }`.
- Rates and ratios use explicitly named integer basis points or documented
  decimal strings, never binary floating-point money.
- Errors use `application/problem+json` with a stable machine-readable code,
  user-safe detail, request identifier, and field errors where relevant.
- Collection endpoints use cursor pagination even if the demonstration dataset
  is small.
- Mutating workflow endpoints require an `Idempotency-Key` where replay could
  duplicate submission, offer acceptance, or disbursement.
- Use optimistic concurrency on editable application resources through a
  version field or `ETag`/`If-Match`.
- Never expose database rows directly. Map persistence records to explicit API
  response models.

### Initial resource surface

| Area | Representative endpoints |
| --- | --- |
| Demonstration access | `POST /demo-sessions`, `GET /demo-scenarios` |
| Applications | `POST /applications`, `GET /applications/{id}`, `PATCH /applications/{id}` |
| Loan selection | `PUT /applications/{id}/loan-request` |
| Customer and finances | `PUT /applications/{id}/customer`, `PUT /applications/{id}/financial-position` |
| Documents | `GET /applications/{id}/document-requirements`, `GET /applications/{id}/documents/demo-pack`, `POST /applications/{id}/documents`, `GET /applications/{id}/documents` |
| Processing | `POST /applications/{id}/document-processing` |
| Review | `GET /applications/{id}/review`, `POST /applications/{id}/corrections` |
| Transactions | `GET /applications/{id}/transactions`, `GET /applications/{id}/transaction-summary` |
| Submission | `POST /applications/{id}/submission` |
| Outcome | `GET /applications/{id}/outcome` |
| Offer | `GET /applications/{id}/offer`, `POST /offers/{id}/acceptance` |
| Simulation | `POST /offers/{id}/disbursement`, `GET /disbursements/{id}` |

Actions are explicit endpoints when they enforce a state transition or create an
audit event. Ordinary editable data remains a resource update.

Document upload uses multipart form data, streams to a controlled local storage
directory, enforces size and content-type limits, calculates a digest, and stores
only metadata and a relative storage key in SQLite. Document bytes do not belong
in the database or API logs. Intake progresses through identity, payslip, and
bank-statement stages. Each stage is processed and persisted before the next is
unlocked, allowing the client to present extracted fields and checks
progressively and resume the same state after refresh.

### Future iOS compatibility

The iOS application should be a separate Swift/SwiftUI codebase. Generate its
transport types and client with Apple's Swift OpenAPI Generator. Keep business
decisions on the server so web and iOS cannot disagree about eligibility,
pricing, or workflow state.

When real authentication is introduced, use an external OpenID Connect provider
with OAuth 2.0 Authorization Code plus PKCE. The initial synthetic
`/demo-sessions` endpoint is explicitly demonstration-only and is not an
authentication pattern to carry into production.

## 6. API implementation boundaries

Organize the API by product capability—applications, documents, transactions,
assessment, offers, and disbursements. Within each capability:

1. a route validates transport input and maps the response;
2. a use case authorizes and coordinates one operation;
3. pure domain functions enforce calculations and state transitions; and
4. a repository performs persistence without returning HTTP concepts.

The affordability and risk engines receive immutable inputs and return a full
versioned result. They do not query the database, read request state, or use the
current clock directly. This makes every synthetic expected result reproducible.

Do not begin with microservices, a message broker, event sourcing, or generic
repository abstractions. The initial system is one deployable API and one worker
against one SQLite database.

## 7. Asynchronous processing

Uploads and document processing should not hold an HTTP request open:

1. API validates and stores the upload.
2. API creates a durable `processing_job` row and returns `202 Accepted` with an
   operation URL.
3. A worker claims the job in a short transaction.
4. The worker records extraction, checks, classifications, and audit events.
5. Web and future iOS clients poll the operation resource with bounded backoff.

For the demonstration, the worker can be a second Node.js process in the same
repository. SQLite runs in WAL mode, has a busy timeout, and allows one job
writer at a time. A lease and attempt count make interrupted jobs recoverable.
This preserves a clean seam for a real queue later without introducing Redis or
cloud infrastructure now.

## 8. SQLite data rules

- Enable foreign keys on every connection and WAL mode during initialization.
- Use migration files; never mutate the schema at application startup outside
  the migration command.
- Store money as integer cents and rates as integer basis points.
- Store booleans as constrained integers and enums with check constraints where
  practical.
- Use UTC timestamps and retain the fixed demonstration date separately.
- Add unique constraints for document digests within an application, accepted
  offer per application, and completed disbursement per offer.
- Wrap submission, accepted-offer creation, assessment snapshots, and simulated
  disbursement transitions in transactions.
- Treat audit events and accepted assessment/offer snapshots as append-only.
- Back up the database before destructive fixture reset or migration commands.

Drizzle migrations own schema evolution. Seed commands are explicit and may load
only the repository's synthetic fixtures.

## 9. Approved UI direction

Use a mobile-first, responsive application shell with a clear progress stepper,
plain Australian English, and persistent save/status feedback.

The visual system, responsive rules, content constraints, and approved reference
are defined in the [UI design system](ui-design.md).

### Applicant journey

1. **Start:** product explanation, simulation notice, new/existing choice.
2. **Existing-customer demo login:** select a synthetic profile; no real
   credentials.
3. **Loan request:** amount, purpose, whole-year term, and indicative repayment.
4. **About you:** identity, contact, household, employment, and housing.
5. **Documents:** separate licence, payslip, and statement cards showing required
   periods, account coverage, upload progress, and problems.
6. **Processing:** per-document status and a safe retry path.
7. **Review:** grouped extracted customer, income, expense, asset, liability,
   account, and transaction-summary data with source and confidence indicators.
8. **Verify and submit:** corrections summary, declarations, and explicit
   confirmation.
9. **Outcome:** affordability result, score band, key reasons, uncertainty, and
   prominent demonstration wording.
10. **Offer and simulated funding:** terms, acceptance, masked destination,
    processing, and confirmation or recoverable failure.

The applicant journey should use focused pages rather than one long form. Resume
from the server-reported application state, not browser-local step state.

### Demonstration operator view

Provide a separate route that lists the eight scenarios and opens a read-only
inspection view showing source provenance, document signals, classifications,
assessment inputs, calculation versions, audit events, and simulated
disbursement events. Operator details must not clutter the applicant screens.

### Accessibility and UI behaviour

- Target WCAG 2.2 AA.
- Build controls from Radix primitives and semantic HTML; do not rely on colour
  alone for risk, confidence, or status.
- Preserve entered data when validation fails and focus the first invalid field.
- Announce upload and processing status changes to assistive technology.
- Require explicit confirmation for submission and offer acceptance, but avoid
  dark patterns or celebratory language around borrowing.
- Use charts only as a supplement to labelled values and tables.

## 10. Local Windows/WSL2 and macOS deployment

The deployment target is one local machine: either Windows with the application
inside a WSL2 Linux distribution, or native macOS. Neither target needs an
inbound public IP address. All remote access, if enabled, arrives through an
outbound tunnel or existing reverse-proxy service; the provider remains a
deployment configuration choice.

```text
                           outbound encrypted connection
┌────────────────┐        ┌──────────────────────┐
│ Browser / iOS  │───────▶│ Proxy or tunnel edge│
└────────────────┘        └──────────┬───────────┘
                                     │
                              no inbound public IP
                                     │
┌────────────────────────────────────▼─────────────────────────────┐
│ Local Windows/WSL2 or macOS host                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Linux runtime in WSL2, or native macOS                    │  │
│  │ reverse proxy ──▶ static web                              │  │
│  │       │                                                    │  │
│  │       └──────────▶ Fastify API ──▶ worker ──▶ SQLite/files │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Runtime rules

- Build the React application once and serve its static files from the local
  reverse proxy. Route `/api/*` to Fastify on the same origin.
- Bind Fastify, health endpoints, and worker control interfaces to loopback; do
  not bind them directly to a public or LAN interface.
- Accept forwarded scheme and client-address headers only from the trusted local
  proxy. Configure the application with the exact proxy hop count.
- Terminate external TLS at the trusted proxy/tunnel edge. Keep the tunnel from
  the local host outbound-only so no router port forwarding is required.
- Put authentication and access policy at the proxy/tunnel boundary for any
  remote demonstration. The synthetic demo session remains a product simulation,
  not perimeter security.
- Add unauthenticated liveness and dependency-aware readiness endpoints that
  disclose no customer, document, or configuration data.
- Run the API and worker as supervised services; do not depend on an open
  terminal session. Use systemd inside WSL2, started through Windows at boot, and
  launchd on macOS.
- On WSL2, keep the SQLite database, WAL files, uploads, and active working
  directory on the Linux ext4 filesystem, not under `/mnt/c`. On macOS, keep
  runtime data under the user's Application Support directory, not in the Git
  checkout.
- Create consistent backups with SQLite's backup mechanism, then copy the closed
  backup artifact to approved host storage. Do not copy a live database file
  without its WAL state.
- Permit outbound connections only for the configured proxy/tunnel and package
  installation. The running demonstration requires no payment, identity, or
  document-analysis network integration.

The reverse proxy or tunnel hostname is the application's configured public
origin, even when it is private to an access-controlled audience. Web API calls
use relative `/api/v1` URLs so no WSL, localhost, or machine IP address appears
in client configuration. CORS can therefore remain same-origin by default.

### Deployment artifacts

Implementation should provide the same pnpm commands on macOS and inside WSL2
for build, migration, seed, start, stop, status, backup, and restore. Avoid
platform-specific application scripts; isolate systemd and launchd integration
in deployment assets. Proxy credentials, tunnel identifiers, hostnames, database
files, uploads, and backups are runtime state and must not be committed. The
chosen proxy provider and platform startup mechanism must be documented before
deployment, but neither changes the API or domain design. See
[Installation and deployment](install-and-deployment.md).

## 11. Testing and contract quality

- Unit-test pure calculations and state transitions with the independently
  authored expected fixture values.
- Test each Fastify route using `inject()` against a temporary migrated SQLite
  database.
- Verify database constraints, idempotency, job recovery, and concurrent retries.
- Generate OpenAPI in CI and fail if the committed document differs.
- Lint the contract with Spectral and run a breaking-change check against the
  main-branch contract.
- Generate and type-check the web client in CI; add Swift-client generation when
  the iOS project begins.
- Use React Testing Library for form and accessibility behaviour.
- Use Playwright for the new-customer, existing-customer, review, referral,
  decline, and successful/retried disbursement journeys.

## 12. Deliberate exclusions

The initial implementation does not need Next.js, server-side rendering,
GraphQL, tRPC, microservices, Kubernetes, Redis, a cloud object store, real OCR,
real identity verification, a payment integration, or real authentication.
These would add operational or client coupling without improving the synthetic
demonstration. External document-analysis providers can later implement the same
internal processing interface without changing the public API.

## 13. Decision summary

Adopt TypeScript, React/Vite, Fastify/TypeBox/OpenAPI, and SQLite/Drizzle. Treat
OpenAPI—not shared TypeScript types—as the client boundary. Keep calculations
pure and server-owned, make document work asynchronous, and keep the web client
as one consumer of a versioned REST API. This gives the demonstration a small
implementation footprint while leaving a direct path to a generated Swift API
client and native SwiftUI application. Deploy the system as supervised services
on Windows/WSL2 or macOS behind a same-origin proxy or outbound tunnel; no
inbound public IP or directly exposed application port is required.
