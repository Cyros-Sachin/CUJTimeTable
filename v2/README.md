# CUJ Exam Date Sheet Automation System (PHP stack)

Same product as the Next.js/Express build in the repo root, rebuilt on **PHP 8.3 + MySQL 8
+ Docker**, no framework — a small hand-written MVC-lite (router, controllers, services,
PHP view templates) plus server-rendered Bootstrap pages with vanilla ES-module JavaScript
calling the JSON API.

## Architecture

```
db/            MySQL schema + seed data (db/schema.sql) — identical schema to the main stack
public/        Apache DocumentRoot: index.php front controller + CSS/JS assets
src/
  Core/        Router, Request, Response, Db (PDO), Session, Auth, Csrf, Validator, View
  Controllers/ One per resource area (Auth, Meta, Dashboard, Entry, Upload, DateSheet, Consolidated, Admin, Page)
  Services/    Business logic — EntryService, ClashService, RefNumberService, PdfService (mPDF),
               ExcelService (PhpSpreadsheet), UploadService, AuditService
views/         PHP templates: shared layout + one template per screen, plus views/pdf/* for mPDF
resources/fonts/  Noto Sans Devanagari, copied in at image build time
storage/       Runtime-writable: tmp, pdf, uploads, sessions, branding (Docker volume)
```

One container (`app`, PHP 8.3 + Apache) + one `db` container (MySQL 8). The browser only
ever talks to `app` on `APP_PORT`.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2). No local PHP/MySQL needed.

## Quick start

```bash
cp .env.example .env
docker compose up --build -d
# open http://localhost:8090  (login with ADMIN_EMAIL / ADMIN_PASSWORD from .env)
```

First boot seeds the database automatically (idempotent — re-running `docker compose up`
never duplicates seed data). You'll be forced to change the admin password on first login.

> **Ports differ from the main stack on purpose.** This PHP build defaults to `8090` (app),
> `8091` (phpMyAdmin) and `3307` (MySQL) so it can run side-by-side with the Next.js/Express
> stack in the repo root (which uses 8080/8081/3306) without clashing. Change them in `.env`
> if you'd rather run this one alone on the standard ports.

### Default login

| Field | Value (from `.env.example`) |
|---|---|
| Email | `examcell@cuj.local` |
| Password | `ChangeMe#12345` |
| Role | Exam Cell Incharge (`EXAM_CELL`) |

If `SEED_DEMO_USERS=true` (default), one demo `DEPT_COORDINATOR` is also seeded per seeded
department (`coordinator.cmb@cuj.local`, `coordinator.csit@cuj.local`), same password,
forced to change it on first login.

## Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `8090` | Host port the app is exposed on |
| `APP_ENV` | `production` | Informational; does not change PHP's `display_errors` (always off — see `docker/php.ini`) |
| `APP_URL` | `http://localhost:8090` | Informational base URL |
| `COOKIE_SECURE` | `false` | Set `true` once served over HTTPS (adds `Secure` to the session cookie) |
| `DB_NAME` | `cuj_datesheet` | Must stay `cuj_datesheet` — `db/schema.sql` creates and selects that database |
| `DB_USER` / `DB_PASSWORD` | `cuj_app` / `change_me_app_password` | App DB credentials — change before real use |
| `DB_ROOT_PASSWORD` | `change_me_root_password` | MySQL root password — change before real use |
| `DB_HOST_PORT` | `3307` | Host port MySQL is published on (for a local client) |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | see above | Seeded Exam Cell account (only created if no users exist yet) |
| `SEED_DEMO_USERS` | `true` | Seed one demo coordinator per seeded department |
| `REF_SEQ_START` | `3000` | Starting sequence number for `CUJ/Exam/Datesheet/<year>/<seq>` reference numbers |

## Common operations

**Back up the database:**
```bash
docker compose exec db mysqldump -u root -p"$DB_ROOT_PASSWORD" cuj_datesheet > backup.sql
```

**Restore it:**
```bash
docker compose exec -T db mysql -u root -p"$DB_ROOT_PASSWORD" cuj_datesheet < backup.sql
```

**Change the exposed port:** edit `APP_PORT` in `.env`, then `docker compose up -d`.

**Rebuild after code changes:**
```bash
docker compose up --build -d
```

**Full reset (wipes the database):**
```bash
docker compose down -v
docker compose up --build -d
```

**phpMyAdmin (optional, for inspecting the database):**
```bash
docker compose --profile tools up -d phpmyadmin
# open http://localhost:8091
```

## Troubleshooting

- **Port already in use** — change `APP_PORT` (or `DB_HOST_PORT` / phpMyAdmin's `8091`) in
  `.env` and re-run `docker compose up -d`.
- **App container unhealthy / "DB not ready"** — `docker/entrypoint.sh` runs `bin/seed.php`
  before Apache starts, and `Db::waitForConnection()` retries up to 30 times (2s apart); a
  cold MySQL first-init can take ~20-30s. Check `docker compose logs db` and
  `docker compose logs app`.
- **Hindi text renders as broken glyphs/boxes in the PDF** — shouldn't happen: the
  `Dockerfile` build fails outright (`test -f resources/fonts/LohitDevanagari-Regular.ttf`)
  if the font isn't found at the expected `fonts-lohit-deva` path. If you see broken glyphs
  anyway, rebuild from scratch (`docker compose build --no-cache app`); if the font package
  layout changed upstream, run `fc-list | grep -i devanagari` inside the image and adjust
  the `cp` line in the `Dockerfile`. (See "Notes on this stack" below for why this build
  uses Lohit Devanagari rather than Noto Sans Devanagari for the PDF specifically.)
- **Login works but every other request returns 401** — cookies are scoped to the `app`
  container's origin; make sure you're hitting the published port, not container-internal
  addresses.
- **"PASSWORD_CHANGE_REQUIRED" on every API call** — expected for freshly seeded accounts;
  visit `/change-password` (or let the forced-password-change page handle it) once.
- **CSRF errors (`403 FORBIDDEN`) on POST/PUT/DELETE** — the session must have loaded the
  page first (the CSRF token lives in `<meta name="csrf-token">`, printed server-side); a
  stale tab open from before a session reset will need a reload.

## Notes on this stack vs. the Next.js/Express one

- No JS framework: `views/*.php` render server-side HTML shells; `public/assets/js/*.js`
  (vanilla ES modules) fetch `/api/*` and hydrate the page, mirroring the React version's
  screens with Bootstrap 5 components instead.
- Sessions replace JWT: PHP's native session (`storage/sessions`, cookie `cuj_session`)
  carries the logged-in user id; `Auth::user()` re-reads the user row from the DB on every
  request, same as the Node stack's JWT-verify-then-reload pattern.
- PDF generation uses **mPDF** (not Puppeteer/Chromium) — HTML/CSS is intentionally
  table-based (`views/pdf/*.php`) since mPDF's CSS support is more limited than a real
  browser engine; Devanagari shaping is handled via mPDF's `useOTL` font flag.
- **Devanagari PDF font is Lohit Devanagari, not Noto Sans Devanagari** — this was tested
  against the original spec's `fonts-noto-core` + mPDF combination and it does not work:
  the Debian-packaged Noto Sans Devanagari sends mPDF 8.3.1's OpenType-shaping parser into
  an infinite loop (fatal memory exhaustion), and a fresh copy of the current Noto Sans
  Devanagari straight from Google's font repo fails with "GPOS Lookup Type 5, Format 3 not
  supported" — both are real incompatibilities between this font family's modern OpenType
  tables and mPDF's older shaping engine, not a packaging or path issue. Lohit Devanagari
  (`fonts-lohit-deva`) uses simpler, older-style tables mPDF parses correctly, and still
  shapes Devanagari conjuncts correctly (verified: `जम्मू केंद्रीय विश्वविद्यालय` renders
  with the `श्व` conjunct intact in the generated PDF). This substitution is PDF-only — the
  web UI (`views/layout.php`, `views/login.php`) still loads real Noto Sans Devanagari from
  Google Fonts for on-screen Hindi text, since browsers' OTL engines handle it fine.
- Excel generation uses **PhpSpreadsheet** (not ExcelJS) — same workbook shape (Consolidated
  / Day-wise Summary / one sheet per department, template with data-validation dropdowns).
- `public/assets/vendor/` is reserved as the spec's documented offline-fallback location for
  Bootstrap/Bootstrap Icons/Flatpickr; the shipped pages load pinned versions from jsDelivr
  by default. Swapping to fully offline assets means downloading those three libraries into
  that folder and repointing the `<link>`/`<script>` tags in `views/layout.php` and
  `views/login.php` — not done here since it's a non-functional, no-network-required nicety
  rather than something the acceptance tests depend on.
