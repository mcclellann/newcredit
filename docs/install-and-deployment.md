# Installation and Deployment

**Status:** Approved deployment plan v1.0

**Targets:** Windows 11 with WSL2, and native macOS

## 1. Current repository status

The repository currently contains requirements, reference data, architecture,
and design material only. There is no application package to install or run yet.
The commands in section 4 are the required interface for the implementation;
they must not be presented as working setup commands until they exist and have
been tested from a clean checkout on both targets.

## 2. Shared deployment shape

Both targets use the same built application and operational model:

```text
outbound proxy/tunnel
        │
        ▼
local reverse proxy ──▶ static React files
        │
        └─────────────▶ Fastify on loopback ──▶ worker ──▶ SQLite/files
```

- The web application and `/api/v1` share one origin.
- Fastify and the worker are never directly exposed to a LAN or public network.
- The proxy or tunnel initiates outbound; no inbound public IP or router port
  forwarding is required.
- Caddy is the preferred local reverse proxy because the same configuration can
  run in WSL2 and macOS. An existing equivalent proxy is acceptable.
- SQLite, uploads, and generated documents remain local to the host.
- Application behaviour, migrations, seed data, and backup format are identical
  on both platforms.

## 3. Version and package management

Implementation must commit:

- a `.node-version` containing the supported Node.js active-LTS version;
- the exact pnpm version in `package.json` through `packageManager`;
- `pnpm-lock.yaml`;
- `.env.example` containing names and safe example values only; and
- a single platform-neutral workspace command surface.

Developers may use any Node version manager that respects `.node-version`.
Corepack supplies the pinned pnpm version. Do not require a global npm-installed
pnpm or maintain different package manifests for Windows and macOS.

`better-sqlite3` may need native compilation when a matching prebuilt binary is
not available. Windows users compile inside Linux/WSL2, not with Windows build
tools. macOS users need Apple's Command Line Tools.

## 4. Required command interface

The completed application must provide and document these commands with the same
behaviour on macOS and inside WSL2:

| Command | Required behaviour |
| --- | --- |
| `corepack enable` | Make the pinned pnpm version available |
| `pnpm install --frozen-lockfile` | Reproduce dependencies without changing the lockfile |
| `pnpm build` | Build API, worker, generated client, and static web assets |
| `pnpm db:migrate` | Apply committed SQLite migrations once and safely |
| `pnpm db:seed:demo` | Idempotently load synthetic demonstration data only |
| `pnpm start:api` | Start Fastify on configured loopback host and port |
| `pnpm start:worker` | Start the durable document-processing worker |
| `pnpm healthcheck` | Verify API readiness without exposing sensitive data |
| `pnpm backup -- <path>` | Create a consistent SQLite and upload backup |
| `pnpm restore -- <path>` | Validate and restore an offline backup explicitly |
| `pnpm test` | Run non-browser automated tests |

Build, migration, seed, backup, and restore commands must exit non-zero on
failure. Start commands remain foreground processes so systemd, launchd, or a
developer terminal can supervise them correctly.

## 5. Windows 11 with WSL2

### Prerequisites

1. Enable WSL2 and install a supported Ubuntu LTS distribution from an elevated
   PowerShell session. Reboot if Windows requests it.
2. Enable systemd for the distribution.
3. Inside WSL, install Git, CA certificates, Python 3, and the standard C/C++
   build toolchain.
4. Install the Node.js version from the repository's future `.node-version`, then
   enable Corepack.
5. Install Caddy or configure the existing local reverse proxy/tunnel.

Exact copy-and-paste commands must be added and tested after the Node version,
Ubuntu LTS baseline, proxy, and tunnel provider are fixed. Do not tell operators
to run a floating `curl | sh` installer without documenting its source and
verification.

### Filesystem

- Clone the repository under the WSL home directory, for example
  `~/src/newcredit`, not under `/mnt/c`.
- Default runtime data to `~/.local/share/newcredit`.
- Default configuration to `~/.config/newcredit`.
- Keep the SQLite database, `-wal` and `-shm` files, uploads, temporary processing
  files, and active backups on the WSL Linux filesystem.
- Copy only a completed backup archive to Windows storage.

### Supervision and startup

- Install separate systemd units for API and worker, plus the selected proxy or
  tunnel where appropriate.
- Use a target unit so start, stop, and status operate on the full application.
- Configure a Windows Scheduled Task to start the WSL distribution and target
  after reboot when unattended operation is required.
- Run services as an unprivileged Linux user with explicit working, data, and
  configuration directories.

## 6. Native macOS

### Prerequisites

1. Install Apple Command Line Tools for Git and native package compilation.
2. Install the Node.js version from the repository's future `.node-version`, then
   enable Corepack.
3. Install Caddy or configure the existing local reverse proxy/tunnel.

Homebrew may be used for operator-managed prerequisites, but application package
installation remains pnpm-based. Exact copy-and-paste commands must be added and
tested on the oldest supported macOS version after runtime versions and proxy
provider are fixed.

### Filesystem

- The Git checkout may live in the normal user workspace.
- Default runtime data to `~/Library/Application Support/NewCredit`.
- Keep configuration, database, WAL files, uploads, and processing files out of
  the Git checkout and iCloud-synchronised folders.
- Write completed backups to an operator-selected local path before copying them
  to other approved storage.

### Supervision and startup

- Install separate launchd property lists for API and worker, and for the proxy
  or tunnel when it is application-managed.
- Run as the logged-in service user without root privileges.
- Set explicit working, data, configuration, and log paths.
- Use launchd restart policies for unexpected failure; do not daemonize Node.js
  processes inside the service.

## 7. Shared configuration

At minimum, runtime configuration will include:

| Setting | Purpose |
| --- | --- |
| `NEWCREDIT_HOST` | Must default to `127.0.0.1` |
| `NEWCREDIT_PORT` | Loopback API port |
| `NEWCREDIT_PUBLIC_ORIGIN` | Exact proxy/tunnel HTTPS origin |
| `NEWCREDIT_DATA_DIR` | Platform-specific persistent data directory |
| `NEWCREDIT_DATABASE_PATH` | SQLite path below the data directory |
| `NEWCREDIT_UPLOAD_DIR` | Synthetic upload storage below the data directory |
| `NEWCREDIT_LOG_LEVEL` | Structured logging level without document content |

Secrets, proxy credentials, and tunnel tokens are entered on the target machine
and never committed. Startup must fail clearly when a required setting is absent
or a data directory is unsafe or unwritable.

## 8. Reverse proxy contract

The local proxy must:

- serve the built React files and SPA fallback;
- proxy `/api/*` to Fastify on loopback without rewriting `/api/v1` semantics;
- set forwarded headers consistently;
- impose upload body and request time limits compatible with documented file
  limits;
- pass a request identifier or allow Fastify to generate one;
- expose no directory listing or runtime data path; and
- forward only the health endpoint needed by the selected tunnel monitor.

Fastify trusts forwarded headers only from the configured local proxy hop. CORS
remains same-origin by default. External TLS and audience access policy belong at
the trusted proxy/tunnel boundary.

## 9. Installation sequence after implementation

The final operator guide must provide this sequence for each target:

1. install and verify platform prerequisites;
2. clone or update an explicitly identified release revision;
3. install the pinned Node.js version and enable Corepack;
4. install dependencies from the frozen lockfile;
5. create runtime directories and configuration with restrictive permissions;
6. build the application;
7. back up any existing deployment;
8. run database migrations;
9. seed synthetic data only on a new or explicitly reset demonstration;
10. install or update supervised services and proxy configuration;
11. start API and worker;
12. verify readiness through the proxy origin; and
13. exercise one synthetic application without accessing a direct service port.

Upgrade and rollback instructions must identify whether a database migration is
backward compatible. Rollback never restores an old binary against an
incompatible newer database; restore the matching verified backup when required.

## 10. Acceptance checks

Installation is not complete until both a clean Windows/WSL2 host and a clean
supported macOS host can demonstrate:

- dependency installation from the committed lockfile;
- build, migration, and idempotent synthetic seed;
- automatic API and worker startup after host reboot;
- same-origin web and API access through the configured proxy/tunnel;
- no listener exposed beyond the intended local proxy;
- successful liveness and readiness checks;
- one complete new- or existing-customer synthetic journey;
- clean stop and restart with application state retained;
- consistent backup and test restore; and
- no credentials, database, uploads, or generated runtime files in Git status.

The implementation task must replace all future-tense placeholders in this guide
with tested commands, supported versions, service files, and troubleshooting
steps before deployment is declared ready.
