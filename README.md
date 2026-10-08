# CUJ Exam Date Sheet Automation System

Automates exam date sheet entry, clash detection, and official PDF/Excel generation for
Central University of Jammu. Department coordinators enter exam details (one by one or via
bulk Excel/CSV upload); the Exam Cell gets a consolidated view across all departments with
Excel, overall-PDF and ZIP export.

**Stack:** Next.js 14 (App Router, TypeScript) frontend · Express/Node 20 API · MySQL 8 ·
Docker Compose.

## Architecture

```
db/            MySQL schema + seed data (db/schema.sql)
server/        Express API (JavaScript, ES modules) — auth, business rules, PDF/Excel/ZIP
client/        Next.js 14 frontend (TypeScript) — talks to the API via /api/* rewrites
docker-compose.yml
```

Three containers: `db` (MySQL), `api` (Express on :4000), `web` (Next.js on :3000, exposed
on `APP_PORT`, default 8080). The browser only ever talks to `web`; Next.js rewrites `/api/*`
to the `api` container over the Docker network.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose v2) — that's it. No local Node/MySQL needed.

## Quick start

```bash
cp .env.example .env
docker compose up --build -d
# open http://localhost:8080  (login with ADMIN_EMAIL / ADMIN_PASSWORD from .env)
```

First boot seeds the database automatically (idempotent — re-running `docker compose up`
never duplicates seed data). You'll be forced to change the admin password on first login.

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
| `APP_PORT` | `8080` | Host port the web UI is exposed on |
| `NODE_ENV` | `production` | Node environment for the API |
| `COOKIE_SECURE` | `false` | Set `true` once served over HTTPS (adds `Secure` to the session cookie) |
| `DB_NAME` | `cuj_datesheet` | Must stay `cuj_datesheet` (matches `db/schema.sql`) |
| `DB_USER` / `DB_PASSWORD` | `cuj_app` / `change_me_app_password` | App DB credentials — change before real use |
| `DB_ROOT_PASSWORD` | `change_me_root_password` | MySQL root password — change before real use |
| `JWT_SECRET` | *(empty)* | Leave empty: the server generates and persists a random secret in `settings` on first boot |
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
# open http://localhost:8081
```

## Troubleshooting

- **Port already in use** — change `APP_PORT` (or `8081` for phpMyAdmin) in `.env` and
  re-run `docker compose up -d`.
- **API container unhealthy / "DB not ready"** — the `api` service waits on the `db`
  healthcheck and retries its own connection up to 30 times (2s apart) on startup; a cold
  MySQL first-init can take ~20-30s. Check `docker compose logs db` and `docker compose logs
  api`.
- **Hindi text renders as broken glyphes/boxes in the PDF** — shouldn't happen: the
  `server/Dockerfile` build fails outright (`fc-list | grep` check) if `Noto Sans
  Devanagari` or `Liberation Serif` aren't installed in the image. If you see broken glyphs,
  rebuild the `api` image from scratch (`docker compose build --no-cache api`).
- **Login works but every other request returns 401** — the browser must be pointed at the
  `web` service (port `8080`), not the `api` service directly; cookies are scoped to that
  origin.
- **"PASSWORD_CHANGE_REQUIRED" on every request** — expected for freshly seeded accounts;
  call `/api/auth/change-password` (or use the UI's forced change-password screen) once.

## Notes on the two app directories

- `server/` is a plain Express API — see `server/src/routes` for the endpoint list, matching
  the contract in `PART 1 / 1.7` of the original spec.
- `client/` is a Next.js App Router frontend. Routing, auth guarding and data fetching are
  all client-side (React Query) since every screen here is interactive and
  session-cookie-gated; there is intentionally no server-rendered data fetching against the
  API.
