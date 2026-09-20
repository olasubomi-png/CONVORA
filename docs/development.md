# Development

## Prerequisites

- Node.js 20 or later
- npm
- A PostgreSQL-compatible database when you start using migrations (Neon is supported)

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` with a real `DATABASE_URL` before running database commands.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
```

Playwright is configured but Phase 0 does not include a browser test suite.

```bash
npm run test:e2e
```

requires a running app and Playwright browsers.

## Environment

Validated server variables:

- `DATABASE_URL` — `postgres://` or `postgresql://` connection string
- `APP_URL` — public origin, no trailing slash
- `NODE_ENV` — `development` | `test` | `production`

`getServerEnv()` must only run on the server.

## Database

Drizzle is configured for PostgreSQL.

- Schema: `db/schema/index.ts` (no domain tables in Phase 0)
- Client: `db/index.ts`
- Kit config: `drizzle.config.ts`
- Migrations: `db/migrations/`

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

These commands require a valid `DATABASE_URL`. They are not required to typecheck, lint, unit-test, or build the Phase 0 application.

Neon connection strings work with the `postgres` client used here. Use `sslmode=require` when connecting to Neon.

## Validation

Use `parseInput` / `safeParseInput` from `lib/validation` for request bodies, query params, and webhook payloads.

## Errors

Throw typed errors from `lib/errors`. Convert unknown failures with `toPublicError` before returning a response.


## Test database

Integration and Playwright tests use a **dedicated** database.

```bash
export TEST_DATABASE_URL=postgresql://convora:convora@127.0.0.1:5432/convora_test
export APP_URL=http://localhost:3000
npm run db:migrate   # apply schema to the test DB (set DATABASE_URL to the same URL)
npm test
```

The test helper refuses URLs that do not include `_test` unless `ALLOW_NON_TEST_DB=1`.
Playwright refuses to start the app server against a non-test `DATABASE_URL`.
