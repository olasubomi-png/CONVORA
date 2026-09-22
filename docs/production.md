# Production deployment

CONVORA is a multi-tenant Next.js application with PostgreSQL (Neon-compatible).
This document describes **preparation** for production. It does not perform deployment.

## Architecture topology

| Component | Recommended runtime | Notes |
| --- | --- | --- |
| Next.js App Router (UI + API routes) | **Vercel** or **AWS VPS** | Stateless request handlers |
| PostgreSQL | **Neon** | Managed; SSL required |
| Domain event outbox processing | **AWS VPS worker** or scheduled job | `processOutbox` is not auto-started by Next.js |
| Rate limiting | Process-local by default | For multi-instance, replace with shared store (Redis) later |
| Redis | **Not required today** | Documented for future distributed rate limits / queues |

Channel credentials (WhatsApp, Facebook, Instagram) are stored **encrypted in the database** using `CHANNEL_SECRETS_KEY`, not as global env vars.

## Environment variables

| Variable | Required (prod) | Classification | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Server-only secret | `postgres://` or `postgresql://` |
| `APP_URL` | Yes | Public origin | No trailing slash; use `https://` in production |
| `NODE_ENV` | Yes | Runtime | Must be `production` |
| `CHANNEL_SECRETS_KEY` | Yes | Server-only secret | Base64 of **exactly 32 bytes** |
| `PAYSTACK_SECRET_KEY` | When accepting payments | Server-only secret | Never expose to client |
| `PAYSTACK_PUBLIC_KEY` | Optional | Client-safe | Requires secret key if set in production |
| `AI_PROVIDER` | Optional | Config | `openai` or `mock` |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | Server-only secret | |
| `OPENAI_MODEL` | Optional | Config | Default `gpt-4o-mini` |

**Never** put secrets in client bundles, API responses, logs, or git.

Generate `CHANNEL_SECRETS_KEY`:

```bash
openssl rand -base64 32
```

## Commands (from package.json)

```bash
npm ci
# Apply SQL migrations in order (production Neon):
for f in db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

`drizzle-kit migrate` is available as `npm run db:migrate` when drizzle meta is configured; the CI path applies `db/migrations/*.sql` in lexical order with `psql`.

**Startup does not run migrations.** Apply migrations as a separate, reviewed step.

## Health endpoints

| Endpoint | Purpose | Status |
| --- | --- | --- |
| `GET /api/health` | Liveness (process up) | 200 |
| `GET /api/health/ready` | Readiness (PostgreSQL reachable) | 200 ready / 503 not ready |

Neither endpoint returns secrets, connection strings, or stack traces.

## Webhook URLs

Set `APP_URL` to the public origin. Configure providers with:

| Provider | Method | Path |
| --- | --- | --- |
| Paystack | `POST` | `{APP_URL}/api/webhooks/paystack` |
| WhatsApp Cloud API | `GET` (verify) / `POST` | `{APP_URL}/api/webhooks/whatsapp` |
| Facebook Messenger | `GET` / `POST` | `{APP_URL}/api/webhooks/facebook` |
| Instagram Messaging | `GET` / `POST` | `{APP_URL}/api/webhooks/instagram` |

All payment and messaging webhooks validate signatures where applicable and are tenant-scoped via installation credentials in the database.

Paystack also uses `{APP_URL}/app/settings/billing/return?reference=…` as the payment callback URL (still requires server-side verify).

## Vercel

**Suitable:** Next.js pages, API routes, webhooks (short request/response), health checks.

**Not automatic on Vercel alone:**

- Continuous domain-event outbox draining (run a worker or cron that invokes outbox processing)
- Multi-instance distributed rate limiting (current limiter is process-local)

Use Vercel env settings for all server variables. Enable HTTPS. Point DNS at Vercel.

## AWS VPS (optional / recommended for workers)

Use a VPS when you need:

- A long-running outbox worker process
- Shared rate-limit store (future Redis)
- Non-serverless operational control

Example process layout:

1. `npm run start` — Next.js (if not on Vercel)
2. Outbox worker — periodic `processOutbox` (application-specific entry; wire via cron or process manager)

PM2 is optional; any supervised process manager is fine.

## Web Chat origins

Installations store an **exact** origin allowlist (scheme + host + port). No `*` wildcards on authenticated org APIs. Configure customer site origins per installation in the product UI.

Session cookies: `httpOnly`, `sameSite=lax`, `secure` in production.

## Smoke tests (after deploy)

1. `GET /api/health` → 200
2. `GET /api/health/ready` → 200
3. Sign in / create org (90-day trial starts)
4. Billing page loads plan catalog
5. Channel webhook verify challenge (Meta/WhatsApp) succeeds with configured tokens
6. Paystack test mode charge (if keys configured) activates subscription only after verify

## Rollback

1. Revert application deploy to previous immutable release.
2. **Do not** reverse-migrate production data unless a dedicated down migration exists (current migrations are forward-only).
3. Rotate compromised secrets (`CHANNEL_SECRETS_KEY`, Paystack keys) and re-encrypt/re-enter channel credentials as required.

## Secret rotation

| Secret | Procedure |
| --- | --- |
| `CHANNEL_SECRETS_KEY` | Schedule maintenance; re-encrypt stored credentials or re-enter tokens |
| `PAYSTACK_SECRET_KEY` | Rotate in Paystack dashboard; update env; redeploy |
| Database password | Rotate in Neon; update `DATABASE_URL`; restart |

## Observability

Use `lib/observability/logger` for structured logs. Field names matching password/token/secret patterns are redacted.

## Prerequisites before go-live

- [ ] Production Neon database provisioned with SSL
- [ ] All migrations applied in order
- [ ] `CHANNEL_SECRETS_KEY` set (32-byte base64)
- [ ] `APP_URL` is public HTTPS origin
- [ ] DNS configured
- [ ] Paystack webhook + keys (if monetizing)
- [ ] Meta/WhatsApp app webhooks pointed at production URLs
- [ ] Outbox processing strategy chosen (cron/worker)
- [ ] Health checks wired in load balancer
- [ ] Backup / point-in-time recovery enabled on Neon


## Recommended deployment sequence

Follow in order. Do not skip migration verification.

### 1. Neon (PostgreSQL)

1. Create a Neon project and database (SSL enabled).
2. Copy the connection string into `DATABASE_URL` (include `sslmode=require`).
3. From a secure machine with the production URL:

```bash
export DATABASE_URL='postgresql://…?sslmode=require'   # do not echo
for f in db/migrations/*.sql; do
  echo "Applying $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$DATABASE_URL" -c "\dt"
```

4. Confirm critical tables exist: `users`, `sessions`, `organizations`, `conversations`, `messages`, `web_chat_installations`, `organization_subscriptions`.

### 2. Secrets

1. Generate `CHANNEL_SECRETS_KEY`: `openssl rand -base64 32`
2. Set `APP_URL` to the public HTTPS origin (no trailing slash).
3. Set `NODE_ENV=production`.
4. Optionally set Paystack and OpenAI keys per the environment table above.

### 3. Vercel (primary app)

1. Import the GitHub repository.
2. Framework: Next.js. Build: `npm run build`. Install: `npm ci`.
3. Node.js **20.x** (see `package.json` engines).
4. Configure all server env vars in the Vercel project (never commit them).
5. Deploy. Point DNS A/CNAME to Vercel. Enable HTTPS.
6. Smoke: `/api/health`, `/api/health/ready`, register/login.

### 4. VPS (optional workers)

1. Install Node 20, clone release, `npm ci`, `npm run build`.
2. Run `npm run start` only if not hosting the app on Vercel.
3. Schedule outbox processing (cron or PM2) against the same `DATABASE_URL`.
4. Put Nginx in front if serving the app from the VPS; terminate TLS at Nginx.

### 5. Provider configuration

1. Paystack webhook → `{APP_URL}/api/webhooks/paystack`
2. WhatsApp Cloud → `{APP_URL}/api/webhooks/whatsapp`
3. Facebook / Instagram → `{APP_URL}/api/webhooks/facebook` and `/api/webhooks/instagram`
4. Web Chat: create installation in-app; allowlist exact browser origins.

### 6. Production verification

1. Register a real user; complete onboarding; open `/org/{slug}`.
2. Enable Web Chat; send a visitor message; confirm inbox + reply path.
3. (If configured) WhatsApp/Meta test message through webhooks.
4. Confirm no secrets appear in browser network responses or client bundles.

## TypeScript scope

Application types come from `db/schema/`. SQL migrations live in `db/migrations/*.sql`.

Do **not** commit or typecheck Drizzle Kit introspect outputs such as `db/migrations/relations.ts` or `db/migrations/schema.ts`. Those files auto-generate duplicate relation keys for composite tenant foreign keys (e.g. multiple membership FKs on `conversation_assignment_history`) and are not imported by the application.

`tsconfig.json` excludes `db/migrations` from compilation. If a local `relations.ts` appears after `drizzle-kit pull`/`introspect`, delete it or leave it ignored.


## VPS deployment with standalone artifact (low-memory hosts)

Low-memory VPS instances (~1 GiB RAM) should **not** run `next build` on the server.
CI and developer machines produce a **standalone** Node server (`output: "standalone"` in `next.config.ts`).

This is compatible with API routes, Drizzle/`postgres`, Web Chat, and channel webhooks. Vercel continues to use its normal Next.js build pipeline and does not require the standalone folder.

### 1. Build outside the VPS

On CI or a machine with ≥2 GiB RAM (Node 20 recommended):

```bash
git checkout <release-sha>
npm ci
export NODE_ENV=production
# set build-time env if your tooling requires non-secret placeholders;
# runtime secrets are injected only on the VPS
npm run build
```

After a successful build, these paths exist:

- `.next/standalone/` — Node server (`server.js`) + traced dependencies
- `.next/static/` — client static assets (must be copied next to standalone)
- `public/` — public assets (e.g. `public/widget.js`)

### 2. Package the artifact

From the repository root after build:

```bash
mkdir -p dist/standalone
cp -a .next/standalone/. dist/standalone/
mkdir -p dist/standalone/.next/static
cp -a .next/static/. dist/standalone/.next/static/
if [ -d public ]; then
  mkdir -p dist/standalone/public
  cp -a public/. dist/standalone/public/
fi
# Optional tarball for scp:
tar -C dist -czf convora-standalone.tgz standalone
```

`serverExternalPackages` includes `argon2` and `postgres` (native modules). Prefer building the artifact on the **same OS/architecture** as the VPS (e.g. Linux x64). If native modules fail to load on the VPS, on the VPS (no build):

```bash
cd /var/www/CONVORA
npm ci --omit=dev
```

and ensure `NODE_PATH` / working directory still runs the standalone server from the package root layout documented below.



### CI standalone artifact

On successful `main` CI runs, GitHub Actions uploads **`convora-standalone`** (`convora-standalone.tgz`).

Download from the workflow run → Artifacts, then on the VPS:

```bash
tar -xzf convora-standalone.tgz
# extracts ./standalone/ with server.js, .next/static, public/
rsync -a standalone/ /var/www/CONVORA/run/
```

Do not run `next build` on low-memory VPS hosts.

### 3. Deploy to the VPS

Example paths assume app root `/var/www/CONVORA`:

```bash
# On VPS — stop process first if upgrading
# pm2 stop convora || true

# Sync artifact (from your workstation/CI)
rsync -a --delete dist/standalone/ user@vps:/var/www/CONVORA/run/

# Or extract tarball into /var/www/CONVORA/run/
```

Create `/var/www/CONVORA/run/.env` on the VPS only (never commit):

```bash
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
DATABASE_URL=postgresql://…?sslmode=require
APP_URL=https://your.production.domain
CHANNEL_SECRETS_KEY=…   # openssl rand -base64 32
# optional: PAYSTACK_*, AI_PROVIDER, OPENAI_*
```

### 4. Start with Node or PM2

```bash
cd /var/www/CONVORA/run
export $(grep -v '^#' .env | xargs)   # or use PM2 env_file
node server.js
```

PM2 example:

```bash
cd /var/www/CONVORA/run
pm2 start server.js --name convora -i 1 --env production
pm2 save
```

`PORT` and `HOSTNAME` are read by the Next standalone server (default port 3000).

### 5. Nginx

Proxy to `http://127.0.0.1:3000` with TLS termination. Forward `Host` and `X-Forwarded-*` headers. WebSocket upgrade is not required for the default Web Chat polling path.

### 6. Health checks

- Liveness: `GET /api/health` → 200
- Readiness: `GET /api/health/ready` → 200 when Postgres is reachable

### 7. Rollback

1. Keep the previous `run/` directory (e.g. `run.prev/`).
2. `pm2 stop convora`
3. Swap directories back to the previous artifact.
4. `pm2 start convora`
5. Do **not** reverse SQL migrations unless a dedicated plan exists.

### 8. What not to do on the low-memory VPS

- Do not run `npm run build` / `next build` on the 908 MiB host.
- Do not run `drizzle-kit push` against production.
- Do not commit `.env*` files.

## Meta channel platform configuration

Server-only environment variables (never expose to the browser):

| Variable | Purpose |
| --- | --- |
| `META_APP_ID` | Meta app id for OAuth |
| `META_APP_SECRET` | Meta app secret (token exchange + webhook signatures) |
| `META_REDIRECT_URI` | Optional; defaults to `{APP_URL}/api/channels/meta/oauth/callback` |
| `META_WEBHOOK_VERIFY_TOKEN` | Shared verify token for Meta webhook challenges |

Without `META_APP_ID` and `META_APP_SECRET`, channel UI shows **Not configured** and OAuth start returns a configuration error. Web Chat continues to work independently.

Webhook URLs (register in Meta app):

- `{APP_URL}/api/webhooks/whatsapp`
- `{APP_URL}/api/webhooks/facebook`
- `{APP_URL}/api/webhooks/instagram`
- OAuth callback: `{APP_URL}/api/channels/meta/oauth/callback`
