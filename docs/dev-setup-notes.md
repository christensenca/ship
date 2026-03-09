# Dev Setup: README vs Actual Steps

This document captures differences between the README's "Getting Started" instructions and what was required to get the app running in a recent setup (March 2026).

## README Instructions (Summary)

```bash
pnpm install
cp api/.env.example api/.env.local
cp web/.env.example web/.env
docker-compose up -d
pnpm db:seed
pnpm db:migrate
pnpm dev
```

Expected: Web at http://localhost:5173, API at http://localhost:3000, PostgreSQL at localhost:5432.

---

## Differences Encountered

### 1. Database Port and Compose File

**README:** Uses `docker-compose up -d` (docker-compose.yml) — PostgreSQL on port **5432**.

**Actual:** Local PostgreSQL was already running on 5432 with password auth (SCRAM), which failed. Used `docker compose -f docker-compose.local.yml up -d postgres` instead.

**docker-compose.local.yml** maps PostgreSQL to port **5433** (to avoid conflict with local install). So `api/.env.local` must use:

```
DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5433/ship_dev
```

`.env.example` uses 5432; that only matches the main `docker-compose.yml`.

### 2. Migrate vs Seed Order

**README:** Lists `pnpm db:seed` before `pnpm db:migrate`.

**Actual:** Migrations must run first to create the schema. Correct order: `pnpm db:migrate` → `pnpm db:seed`.

### 3. Login Failure (Cross-Origin Cookies)

**README:** Does not mention this.

**Actual:** Login failed with "Login failed" because `scripts/dev.sh` set `VITE_API_URL="http://localhost:$API_PORT"`. The frontend then called the API directly (e.g. 5174 → 3001). Browsers treated session cookies as third-party and blocked them.

**Fix:** Stop setting `VITE_API_URL` in dev so the frontend uses same-origin `/api/*` requests. Vite proxies those to the API, keeping requests and cookies on the same origin.

### 4. Build Shared Before First Run

**README:** Does not mention `pnpm build:shared`.

**Actual:** Needed `pnpm build:shared` before `pnpm dev` for a clean setup. `dev.sh` runs it when creating a fresh DB, but not when `.env.local` already exists.

### 5. Corrupted Dependencies

**README:** Assumes `pnpm install` succeeds.

**Actual:** A previous install was corrupted (ENOENT on lib0). Required a clean reinstall:

```bash
rm -rf node_modules api/node_modules web/node_modules shared/node_modules pnpm-lock.yaml
pnpm install
```

### 6. Ports Can Vary

**README:** Expects fixed ports (5173, 3000).

**Actual:** `scripts/dev.sh` picks the first free ports (e.g. 3001/5174 or 3002/5175) when 3000/5173 are in use. Check `.ports` or the dev script output for current URLs.

---

## Recommended Setup (Post-Discovery)

```bash
# 1. Install dependencies
pnpm install
pnpm build:shared

# 2. Start PostgreSQL (pick one)
# Option A: docker-compose.yml — Postgres on 5432
docker-compose up -d

# Option B: docker-compose.local.yml — Postgres on 5433 (avoids local Postgres conflict)
docker compose -f docker-compose.local.yml up -d postgres

# 3. Configure api/.env.local
# For Option A: DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5432/ship_dev
# For Option B: DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5433/ship_dev

# 4. Database (migrate first, then seed)
pnpm db:migrate
pnpm db:seed

# 5. Start dev
pnpm dev
```

Use the URLs printed by `pnpm dev` (or in `.ports`); they may differ from 5173 and 3000.
