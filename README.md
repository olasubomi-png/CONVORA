# CONVORA

The communication layer between organizations and the people they serve.

## Overview

CONVORA is a production SaaS product for organizational communication: conversations from multiple channels into one operating system for agents.

**Current status: Phase 0 — engineering foundation.**

This repository contains the application skeleton, typed environment validation, Drizzle/PostgreSQL setup, error and validation conventions, security and architecture documentation, and a public landing page.

It does not contain authentication, conversations, AI, channel integrations, or payments.

## Architecture

Organizations are the tenancy boundary. Users belong to organizations through memberships. Customers, conversations, messages, and channels are organization-owned.

Channel providers (WhatsApp, Facebook, Instagram, email, website widget, SMS) connect through isolated adapters. The conversation engine must not depend on provider SDKs.

See [docs/architecture.md](docs/architecture.md).

## Technology

- Next.js App Router
- TypeScript (strict)
- React
- Tailwind CSS
- Drizzle ORM
- PostgreSQL (Neon-compatible)
- Zod
- ESLint
- Vitest
- Playwright (configured, no Phase 0 browser suite)

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Full notes: [docs/development.md](docs/development.md).

## Environment variables

Server-only variables, validated with Zod:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Public origin without a trailing slash |
| `NODE_ENV` | `development`, `test`, or `production` |

Never commit `.env` or `.env.local`.

## Testing

```bash
npm test
npm run typecheck
npm run lint
```

Unit tests cover environment parsing, error mapping, validation helpers, and utilities.

## Database

Drizzle is configured. Phase 0 does not define domain tables.

```bash
npm run db:generate
npm run db:migrate
```

These commands need a reachable `DATABASE_URL`. The application typecheck, lint, unit tests, and production build do not require a live database.

## Security

Multi-tenant rules, secret handling, and future auth constraints are documented in [docs/security.md](docs/security.md).

Do not trust a browser-supplied organization ID.

## Project structure

```
app/            App Router pages
components/     Landing page UI
db/             Drizzle client, schema, migrations
lib/            Environment, errors, validation, utilities
tests/          Unit tests and Playwright config target
docs/           Architecture, security, development
```

## Roadmap

- **Phase 0** — Engineering foundation (this repository state)
- **Phase 1** — Authentication, organizations, memberships
- Later — Customers, conversations, channel adapters, agent inbox

## License

Proprietary. All rights reserved.
