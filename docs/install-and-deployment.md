# Installation and Deployment — Step-by-Step Operator Guide

This guide starts with a new machine and ends with the synthetic loan demo
running in a browser. Choose **Windows/WSL2** or **macOS**, then follow the shared
steps. Commands are shown without a `$` prompt so you can copy entire blocks.

## 1. What works today, and what does not

The current implementation includes React/Vite, Fastify/OpenAPI, SQLite,
progressive document uploads and document-driven assessment. A, B, C and H are
optional sample packs, not prescribed outcomes. Supported text-PDF layouts are
parsed from their contents, not recognised only by approved hashes. Arbitrary
synthetic PDFs using supported layouts can be supplied, but arbitrary layouts
cannot. There is no OCR, document-authenticity/fraud detection, identity
verification, production authentication or real lending service.

The commands below run the **development demonstration**. Tests, builds,
migrations, and the shared command sequence have been exercised in an Amp Linux
orb. The Windows installation, Windows-to-WSL networking, and native macOS
prerequisite steps still require testing on those operating systems. Do not
interpret this guide as certification of a production deployment.

Unattended startup, systemd/launchd service files, packaged production execution,
and a configured public tunnel are not supplied yet. You do not need a public
IP address, Caddy, or a tunnel to run the demo on the machine itself.

### Before you begin

- Allow time for the first dependency download and possible native compilation.
- You need Internet access for GitHub, Node.js, and the package registry.
- You need permission to read `mcclellann/newcredit` on GitHub.
- Use synthetic information only. Never upload real licences, payslips, or bank
  statements.
- Do not run application commands with `sudo` or as Administrator.
- Keep your checkout and runtime files out of OneDrive, iCloud Drive, network
  shares, and other synchronised folders.

## 2. Windows 11: install Ubuntu under WSL2

### 2.1 Install WSL — Windows PowerShell, as Administrator

Open Start, search for **PowerShell**, right-click it, and choose **Run as
administrator**. Run:

```powershell
wsl --install -d Ubuntu-24.04
```

If Windows requests a restart, restart before continuing. Launch **Ubuntu
24.04** from Start. On first launch, create a Linux username and password.
The password is separate from your Windows password; nothing is displayed
while typing it, which is normal.

If WSL is already installed, inspect it from PowerShell:

```powershell
wsl --list --verbose
```

The Ubuntu distribution should show version `2`. If it shows version `1`:

```powershell
wsl --set-version Ubuntu-24.04 2
```

Use the distribution name actually printed by `wsl --list --verbose` if it
differs. These commands and the examples below use `Ubuntu-24.04`.

### 2.2 Install Linux prerequisites — Ubuntu terminal

All remaining Windows setup commands run **inside Ubuntu**, not PowerShell,
Command Prompt, or Git Bash:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates build-essential python3 python3-venv sqlite3
git --version
python3 --version
uname -m
```

The compiler and Python support `better-sqlite3` if a prebuilt binary is not
available. `sqlite3` is used for health checks and backups later in this guide.

Keep the repository on the Linux filesystem, for example `~/src/newcredit`,
**not** `/mnt/c/Users/...`. This improves file-watcher behaviour and avoids
SQLite/filesystem complications.

### 2.3 Continue to the shared installation

Skip the macOS section and continue at **Section 4** in the Ubuntu terminal.
Systemd is not required for the foreground demonstration described here.

## 3. macOS: install native prerequisites

### 3.1 Open Terminal and install Apple Command Line Tools

Open **Applications → Utilities → Terminal**, then run:

```bash
xcode-select --install
```

Complete the Apple installation dialog before continuing. If the tools are
already installed, macOS may report that instead; it is not a failure.

```bash
xcode-select -p
git --version
curl --version
sqlite3 --version
uname -m
```

Apple Silicon normally reports `arm64`; Intel reports `x86_64`. Use a native
Terminal session, not a Rosetta-translated session, so Node and native SQLite
dependencies have matching architectures.

Python is optional for running the app on macOS if a SQLite prebuilt binary is
available, but is needed for native compilation and document generation. Check:

```bash
python3 --version
```

If missing, install Python 3 using the official macOS installer at
[python.org/downloads/macos](https://www.python.org/downloads/macos/), reopen
Terminal, and check again. No Homebrew installation is required by this guide.

## 4. Shared installation — Ubuntu or macOS terminal

### 4.1 Clone the repository

```bash
mkdir -p "$HOME/src"
cd "$HOME/src"
git clone https://github.com/mcclellann/newcredit.git
cd "$HOME/src/newcredit"
git status --short --branch
git rev-parse HEAD
```

The final command records the exact revision you installed. If GitHub asks for
credentials, use your organisation's approved GitHub authentication method.
GitHub account passwords do not authenticate HTTPS Git operations. Do not put
tokens into command examples, remote URLs, or configuration committed to Git.

If you already have the checkout, do not clone over it. Open that checkout and
inspect `git status` first; see the update instructions in Section 9.

### 4.2 Install a Node version manager

This guide uses [nvm](https://github.com/nvm-sh/nvm) from its official repository,
pinned to tag `v0.40.3`, rather than piping a floating download into a shell.
The commands execute code from that repository; inspect it or use your approved
Node installation method if your organisation requires additional verification.
The Git tag is a version pin, not an independently verified signature.

If nvm is **not already installed**:

```bash
git clone --branch v0.40.3 --depth 1 https://github.com/nvm-sh/nvm.git "$HOME/.nvm"
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm --version
```

If `~/.nvm` already exists, do not delete it or clone over it. Load the existing
installation instead:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm --version
```

For automatic loading in future terminals, add these lines **once** to
`~/.bashrc` on Ubuntu, or `~/.zshrc` for the default macOS shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

You can edit the appropriate file with `nano ~/.bashrc` or `nano ~/.zshrc`.
In nano, save with Ctrl+O, press Enter, then exit with Ctrl+X. Reopen Terminal
after editing, or run the loading commands above in the current terminal.

### 4.3 Install Node 24 and activate the pinned pnpm

Run from the repository root:

```bash
cd "$HOME/src/newcredit"
nvm install
nvm use
node --version
npm install --global corepack
corepack enable
pnpm --version
```

`nvm install` reads `.nvmrc` (`24`) and installs the latest available Node 24
patch. Expect `node --version` to start with `v24.`. The exact package manager
is pinned by `package.json`; expect `pnpm --version` to print `12.0.0`.
Corepack may ask permission to download that version the first time.

Installing Corepack globally here is within your nvm-managed Node installation;
do not prefix these commands with `sudo`. If you already manage Corepack through
an approved toolchain, use that installation rather than replacing it.

### 4.4 Install the application dependencies

```bash
pnpm install --frozen-lockfile
```

Wait for a successful exit. Native SQLite installation may take longer than the
other packages. Keep `--frozen-lockfile`: it installs the versions recorded in
the repository without silently changing the dependency selection.

You do not need to regenerate PDFs to run the demo: synthetic documents are
already included in the repository.

## 5. Create persistent local configuration

These examples use `runtime/` under the checkout for a simple demo installation.
It is ignored by Git. Do not remove it when updating: it holds your synthetic
applications, uploaded files, and local backups.

Run from `~/src/newcredit`:

```bash
umask 077
mkdir -p runtime/uploads runtime/backups
cat > runtime/demo.env <<EOF
export HOST=127.0.0.1
export PORT=3001
export DATABASE_URL="$PWD/runtime/newcredit.sqlite"
export NEWCREDIT_UPLOAD_DIR="$PWD/runtime/uploads"
EOF
chmod 600 runtime/demo.env
. ./runtime/demo.env
```

This creates or replaces only `runtime/demo.env`, not the database. Paths are
absolute and quoted, so a checkout path containing spaces is supported. If you
move the checkout, recreate this file with the new paths.

**Important:** copying `.env.example` to `.env` does not automatically configure
the API. It reads `process.env`, and the current startup scripts do not load
`.env`. Source the trusted local file with `. ./runtime/demo.env` in **every
terminal** where you run migrations or the API. Sourcing executes shell code;
do not source files from untrusted sources.

### Configuration reference — currently implemented names

| Variable | Meaning | Value used here |
| --- | --- | --- |
| `HOST` | Fastify bind address | `127.0.0.1` |
| `PORT` | Fastify port | `3001` |
| `DATABASE_URL` | SQLite file path, not a network URL | Absolute `runtime/newcredit.sqlite` path |
| `NEWCREDIT_UPLOAD_DIR` | Persisted synthetic document directory | Absolute `runtime/uploads` path |
| `CORS_ORIGIN` | Optional comma-separated additional allowed API origins | Unset for same-origin Vite proxy |
| `VITE_API_URL` | Optional separate API base origin at web build/dev time | Unset for same-origin Vite proxy |

Do not substitute proposed names such as `NEWCREDIT_HOST` or
`NEWCREDIT_DATABASE_PATH`: the current server does not read them. `HOST` must be
set explicitly because the server otherwise binds to `0.0.0.0`.

For a managed installation, keep data outside the checkout, conventionally
`~/.local/share/newcredit` on WSL or `~/Library/Application Support/NewCredit`
on macOS. Create the directory and point both paths at it; retain the quoting
around macOS paths containing spaces. The remainder of this walkthrough assumes
the simpler `runtime/` layout above.

## 6. Check the build and initialise SQLite

```bash
cd "$HOME/src/newcredit"
nvm use
. ./runtime/demo.env
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
sqlite3 "$DATABASE_URL" 'PRAGMA user_version; PRAGMA integrity_check;'
```

Run each command successfully before continuing. Expected results:

- Typecheck and build exit without errors.
- The web, API and domain test suites exit successfully; test counts vary by revision.
- Migration prints `Database migrations are up to date.`
- SQLite currently reports schema version `5`, then `ok`.

Migrations are safe to rerun; they apply only outstanding schema versions. There
is no separate seed command: applications start empty, with derived values built
from uploaded evidence and declarations rather than selected scenario fixtures.

## 7. Start the demonstration using two terminals

Keep both terminals open while demonstrating. These foreground processes do not
automatically survive logout, reboot, closing Terminal, or WSL shutdown.

### Terminal 1 — API

```bash
cd "$HOME/src/newcredit"
nvm use
. ./runtime/demo.env
pnpm --filter @newcredit/api dev
```

This checks migrations and starts the API watcher. It may be quiet after the
migration message; use the health check below instead of assuming it failed.

### Terminal 2 — web interface

Open another Ubuntu terminal on Windows, or another Terminal tab on macOS:

```bash
cd "$HOME/src/newcredit"
nvm use
pnpm --filter @newcredit/web exec vite --host 127.0.0.1 --port 5173 --strictPort
```

Expect Vite to print a local address using port `5173`. The explicit host keeps
the web service on loopback, and `--strictPort` prevents it silently choosing
another port. The web server proxies `/api` to `127.0.0.1:3001`.

The shorter `pnpm dev` command exists, but this guide uses separate terminals to
make logs and shutdown clearer and explicitly override Vite's default
`0.0.0.0` listener. Avoid `pnpm dev` if you require both listeners to stay on
loopback with the current repository defaults.

### Terminal 3 — verify health and open a browser

```bash
curl --fail --show-error http://127.0.0.1:3001/health
curl --fail --show-error --output /dev/null http://127.0.0.1:5173/
curl --fail --show-error http://127.0.0.1:5173/api/v1/demo-scenarios
```

The health response should be `{"status":"ok"}`. The second command should
exit successfully, and the third should return scenarios A, B, C, and H.

On **macOS**, open the web page from Terminal:

```bash
open http://127.0.0.1:5173
```

On **Windows**, type `http://localhost:5173` into your Windows browser. WSL2
normally forwards localhost access to the Linux service. If the Ubuntu curl
checks pass but your Windows browser cannot connect, see Section 11.

These addresses are for a demo running on your own Windows/Mac machine. They
are not URLs for accessing an Amp orb from your machine; use the orb's supplied
portal instead when reviewing an Amp-hosted preview.

### Walk through the app

1. Choose **New customer** or the simulated existing-customer login. Both start
   empty and require identity evidence; login does not verify identity.
2. Optionally download a sample ZIP and extract it using Explorer or Finder.
   Pack B lacks identity; older H packs without identity are also incomplete
   (the current H manifest includes a licence). Supply
   consistent supported identity evidence to proceed; there is no bypass and
   mixing another person's identity into a pack does not resolve it.
3. Upload/process a supported driver's-licence text PDF, then payslips and bank
   statements. Inspect extracted fields, arithmetic and reconciliation issues.
4. Use the fixed assessment date **1 October 2026**, not today's date. Supply
   complete, non-overlapping statements for **1 July–30 September 2026** for
   every account with transactions, with consistent adjoining balances.
5. Payslips paid **1 August–30 September 2026** must cover at least 56 days of
   non-overlapping pay periods, with recent evidence at September end within
   the pay cadence. Weekly, fortnightly and monthly frequencies are supported.
6. Confirm categories for every unknown or cash transaction. Cash is not
   automatically gambling. Only matched transfers between uploaded accounts
   are excluded as internal transfers.
7. Validate the pre-filled applicant and financial information. Living costs,
   housing and repayments use statement averages; assets use the latest positive
   balance per account, and liabilities include observed overdrafts only. The
   living-expense benchmark is assessed separately, not presented as extracted
   spending. Correct amounts and add costs, other assets and loan/card balances
   not shown in the documents. Saved corrections survive later uploads. Complete
   contact and specific loan-purpose details, confirm household, continuing income
   and that all accounts have been supplied. Foreseeable changes other than blank/“none”
   require review; salary credits and payslip income must reconcile within 20%.
8. Resolve all evidence and declaration blockers before submitting. The result
   depends on documents and declarations, not pack choice. Scores are approximate
   demonstration heuristics, not calibrated default predictions. Only eligible
   outcomes can proceed to simulated offers/funding; no real money moves.

### Stop and start again

Press **Ctrl+C** in Terminal 2 and Terminal 1. Start them again with the same
commands when needed. Reuse `runtime/demo.env` and the existing database;
do not reinstall dependencies each time. Saved application URLs can be reopened
after restart using the same local origin, and persisted upload progress resumes.

## 8. Optional document-generation tooling

Skip this section unless you intend to edit or regenerate synthetic PDFs.
Python document tooling is separate from the application runtime:

```bash
cd "$HOME/src/newcredit"
python3 -m venv runtime/document-tools
runtime/document-tools/bin/python -m pip install -r requirements-docs.txt
```

The virtual environment stays in the Git-ignored `runtime/` directory. Read the generator
and synthetic-data policy before running generation: regenerated files can
change extracted evidence and demo results. Hashes identify stored bytes and
duplicates, not an extraction allowlist. A plain install
does not require executing `scripts/generate-synthetic-documents.py`.

## 9. Updates, backups, and rollback

### 9.1 Stop and back up before updating

Stop both servers using Ctrl+C, then run from the repository root:

```bash
. ./runtime/demo.env
backup_dir="$PWD/runtime/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
sqlite3 "$DATABASE_URL" ".backup '$backup_dir/newcredit.sqlite'"
cp -R "$NEWCREDIT_UPLOAD_DIR" "$backup_dir/uploads"
git rev-parse HEAD > "$backup_dir/revision.txt"
sqlite3 "$backup_dir/newcredit.sqlite" 'PRAGMA integrity_check;'
```

Expect `ok`. Keep the database and uploaded-file backup together. SQLite's
backup command creates a consistent database copy; do not copy only the live
`.sqlite` file while ignoring its WAL. Protect backups as local runtime data.

### 9.2 Update a clean checkout

```bash
git status --short --branch
```

If you have local edits, stop and preserve them before updating; do not discard
them to make these commands work. With a clean checkout:

```bash
git pull --ff-only origin main
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
. ./runtime/demo.env
pnpm db:migrate
```

Check `sqlite3 "$DATABASE_URL" 'PRAGMA user_version; PRAGMA integrity_check;'`
reports `5` and `ok`. Both dependency installation and migration are required
for this update. Old fixture-based drafts must restart as new document-driven
applications; legacy fixture assessments are read-only, not converted evidence.
Do not delete the database to bypass missing evidence or migration requirements.

Then restart both terminals as in Section 7. Record `git rev-parse HEAD` again.
For a controlled release, use an owner-approved tag or revision rather than
following a moving `main` branch.

### 9.3 Rollback safety

Do not run an older application against a newer incompatible schema. Stop both
servers, retain the failed deployment and runtime data, and restore a matched
code revision, database backup, and uploads into a separate installation first.
Verify integrity and a synthetic journey before switching back. There is no
automated downgrade/restore command; seek the maintainer's migration guidance
before replacing existing runtime files.

## 10. Remote access without a public IP — deployment planning

The intended deployment uses an outbound tunnel/proxy; it does not require router
port forwarding or a public IP on your Windows/Mac machine:

```text
Viewer → authenticated HTTPS tunnel → local reverse proxy
                                      ├─ React static files + SPA fallback
                                      └─ /api/* → loopback Fastify → SQLite/files
```

The current demo processes documents in the API; there is no separate worker
service to install. Caddy is the preferred future local reverse proxy, but this
repository does not yet provide its configuration or select a tunnel provider.
Do not expose the Vite dev server, simulated login, or document API directly to
the public Internet as a substitute for that work.

Before remote/unattended deployment is called ready, supply and validate:

- same-origin web/API routing, SPA fallback, and HTTPS;
- audience authentication/access controls at the trusted tunnel boundary;
- only loopback API listeners and no runtime directory served over HTTP;
- upload limits compatible with 20 MiB per file, request timeouts, and a precise
  forwarded-header trust policy;
- a verified API production command and packaged fixture/migration paths—do not
  assume `pnpm build` alone creates a self-contained deployable bundle;
- systemd services on WSL or launchd services on macOS, unprivileged execution,
  log locations, restart policy, and tested reboot behaviour;
- a Windows startup mechanism for the WSL distribution when unattended;
- backup, restore, upgrade, rollback, and end-to-end checks on both target hosts.

Tunnel tokens and credentials belong on the target host, never in Git.

## 11. Troubleshooting with example commands

### `nvm`, `node`, `corepack`, or `pnpm`: command not found

Load nvm in this terminal and select the repository version:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
cd "$HOME/src/newcredit"
nvm use
node --version
corepack enable
pnpm --version
```

If Corepack itself is missing, install it with `npm install --global corepack`
using the nvm-managed Node. Do not solve permission errors by running pnpm as root.

### Native SQLite dependency will not install

First check architecture and toolchain:

```bash
node --version
node -p 'process.platform + " " + process.arch'
python3 --version
```

On Ubuntu, verify `build-essential` is installed; on macOS, run
`xcode-select -p`. Read the first compiler/install error before retrying
`pnpm install --frozen-lockfile`. Do not copy `node_modules` between Windows,
WSL, Intel macOS, and Apple Silicon; native binaries are platform-specific.
Do not delete or regenerate `pnpm-lock.yaml` to hide an install error.

### `EADDRINUSE` or Vite says port 5173 is occupied

Inspect listeners instead of terminating an unknown process:

Ubuntu:

```bash
ss -ltnp | grep -E ':3001|:5173'
```

macOS:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Stop your previous demo with Ctrl+C. Keep API port `3001` unless you also update
Vite's configured proxy target. Changing only `PORT` leaves the web proxy pointing
at the old API port.

### Database directory does not exist, or progress disappears on restart

Check that you are in the correct checkout and loaded the same configuration:

```bash
pwd
. ./runtime/demo.env
printf 'Database: %s\nUploads: %s\n' "$DATABASE_URL" "$NEWCREDIT_UPLOAD_DIR"
ls -ld runtime runtime/uploads
pnpm db:migrate
```

Without `DATABASE_URL`, the API falls back to a relative `newcredit.sqlite`.
Do not assume that is the database created by these instructions. Stop the API,
load the absolute paths, and start it again. Do not delete unfamiliar databases.

### The UI loads but API calls fail

```bash
curl --fail --show-error http://127.0.0.1:3001/health
curl --fail --show-error http://127.0.0.1:5173/api/v1/demo-scenarios
```

If the first fails, check Terminal 1. If only the second fails, check Terminal 2
and confirm the API still uses port `3001`. Leave `VITE_API_URL` unset for this
same-origin setup. Do not add wildcard CORS as a workaround.

### Windows browser cannot reach WSL, but Ubuntu curl works

Confirm the two curl checks above work inside Ubuntu. From Windows PowerShell:

```powershell
wsl --list --verbose
Test-NetConnection -ComputerName localhost -Port 5173
```

Check Windows VPN, firewall, WSL localhost-forwarding settings, and your
organisation's network policy. If instructed to restart WSL, stop the demo first:

```powershell
wsl --shutdown
```

This stops **all running WSL distributions and their processes**, not just this
demo. Reopen Ubuntu and restart both services afterwards. Do not open firewall
ports or bind to `0.0.0.0` as an unexplained workaround.

### Upload rejected, or the next step stays locked

- Extract the ZIP first; upload PDFs, not the ZIP itself.
- Supply consistent applicant evidence and the correct document type for the stage.
  Duplicate files do not fill coverage gaps; remove overlapping evidence.
- Uploads accept PDF, JPEG and PNG up to 20 MiB, but extraction supports text
  PDFs only (at most 20 pages, with text-size limits). Images and scanned PDFs
  need OCR/manual review, which this demo does not perform.
- Read per-file errors for unsupported layouts, missing fields, dates and
  arithmetic/reconciliation failures. Modified PDFs are not rejected merely
  because their hash differs; their parsed contents must meet the checks.
- B lacks identity; older H packs without identity are incomplete too, although
  the current H manifest includes a licence. C has incomplete/problematic evidence. These
  samples do not bypass submission gates. There is no implemented manual-review
  override that makes incomplete evidence eligible for automated assessment.

### What to include in a support report

Include your OS/version, CPU architecture, `node --version`, `pnpm --version`,
`git rev-parse HEAD`, which step failed, and the relevant error text. Never send
tokens, passwords, environment dumps, real documents, or private runtime data.
