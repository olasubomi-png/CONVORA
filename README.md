# CONVORA

The communication layer between organizations and the people they serve.

**Current status: Phase 4 — customer intelligence.**

## Overview

Phase 1 adds users, Argon2id passwords, opaque sessions, organizations, memberships, server-side authorization, and tenant isolation on top of the Phase 0 foundation.

Not included: conversations, channels, customers, AI, public profiles, billing.

## Identity model

```
User → Membership (role, status) → Organization
```

Roles: `OWNER`, `ADMIN`, `AGENT`. Ownership is the OWNER membership role (one non-REMOVED owner per org via partial unique index).

## Development

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL and APP_URL
npm run db:migrate
npm run dev
```

## Testing

Requires a dedicated test database (`TEST_DATABASE_URL`, name should include `_test`).



```bash
npm test          # unit + integration (requires PostgreSQL)
npm run typecheck
npm run lint
npm run build
```

## Database tables

`users`, `organizations`, `memberships`, `sessions`, `audit_events`

## Security

Argon2id, hashed session tokens, HTTP-only cookies, membership-based authz, tenant isolation at the query layer. See `docs/security.md`.

## Roadmap

- Phase 0 — Engineering foundation
- Phase 1 — Identity & tenancy (current)
- Phase 2 — Agent/organization profiles & verification foundations
- Later — Conversations, channel adapters, inbox


## Phase 2 notes

Agent profiles attach to memberships (OWNER, ADMIN, or AGENT). Public routes: `/agents/[username]`, `/org/[slug]`. Verification is administrative and independent of posts.
