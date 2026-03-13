# Railway Deploy

Deploy Ship API and web services to Railway.

## Services

| Service | Dockerfile | URL |
|---------|-----------|-----|
| api | `Dockerfile.railway` | https://api-production-afed.up.railway.app |
| web | `Dockerfile.web.railway` | https://web-production-2625cd.up.railway.app |

Project ID: `7ee41ea5-c7d4-43ea-8d24-76d243656a9c`

## Deploy Both Services

```bash
railway up --service api --detach
railway up --service web --detach
```

## Deploy One Service

```bash
railway up --service api --detach   # API only
railway up --service web --detach   # Web only
```

## Check Status / Logs

```bash
railway logs --service api --lines 50
railway logs --service web --lines 50
```

## Verify After Deploy

```bash
# API health check
curl https://api-production-afed.up.railway.app/health
# Expected: {"status":"ok"}

# API through nginx proxy (tests private networking)
curl https://web-production-2625cd.up.railway.app/api/health
# Expected: {"status":"ok"}
```

## Environment Variables

```bash
railway variables --service api    # View API vars
railway variables --service web    # View web vars

# Set a variable
railway variables set KEY=value --service api
```

## Key Variables (api service)

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `SKIP_SSM` | `true` (bypasses AWS SSM — Railway injects env vars directly) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway service reference) |
| `CORS_ORIGIN` | `https://web-production-2625cd.up.railway.app` |
| `SESSION_SECRET` | (random base64 string) |

## Key Variables (web service)

| Variable | Value |
|----------|-------|
| `API_INTERNAL_PORT` | `8080` (Railway-injected PORT for the api service) |

## Architecture Notes

- **Private networking**: nginx proxies `/api/`, `/collaboration/`, `/events` to `api.railway.internal:8080` so all requests are same-origin (required for `sameSite: strict` session cookies).
- **DNS resolver**: Railway containers use an IPv6 DNS resolver (`fd12::10`). The Dockerfile CMD reads `/etc/resolv.conf` at startup and injects the correct resolver into nginx, with IPv6 addresses wrapped in brackets. This ensures nginx re-resolves `api.railway.internal` per request — avoiding stale IPs after redeployments.
- **Migrations**: Run automatically on every API container start (`node dist/db/migrate.js` before `node dist/index.js`).
- **Database seeding** (one-time, if needed):
  ```bash
  DATABASE_URL="postgresql://postgres:PASSWORD@gondola.proxy.rlwy.net:58799/railway" pnpm db:seed
  ```
  Login: `dev@ship.local` / `admin123`

## Troubleshooting

**API requests returning 499/502/504 after redeploy**
nginx cached a stale IP for `api.railway.internal`. The current config uses dynamic DNS re-resolution, so this should self-heal. If not, redeploy the web service to pick up a fresh resolver:
```bash
railway up --service web --detach
```

**API crashes on startup**
Check for missing env vars: `railway logs --service api --lines 50`. Common causes:
- `DATABASE_URL` not set (check `${{Postgres.DATABASE_URL}}` reference)
- `SESSION_SECRET` missing

**Port mismatch (API_INTERNAL_PORT)**
Railway injects `PORT` dynamically. Check what port the API is actually listening on:
```bash
railway logs --service api --lines 20 | grep "running on"
```
If not 8080, update `API_INTERNAL_PORT` on the web service:
```bash
railway variables set API_INTERNAL_PORT=NEW_PORT --service web
railway up --service web --detach
```
