# CONVORA security principles

## Multi-tenancy
Organization is the security boundary. Derive tenant from session + membership, never from client-supplied IDs alone.

## Authentication
Argon2id passwords. Hashed session tokens. HTTP-only cookies. Rate limits on register/login (in-memory; replace with Redis for multi-instance).

## Authorization
`requireAuthenticatedUser`, `requireActiveMembership`, `requireOrganizationRole`. Suspended/removed memberships are not active.

## Audit
`audit_events` for USER_REGISTERED, USER_LOGIN, USER_LOGOUT, ORGANIZATION_CREATED, membership events. No secrets in payloads.

## Rate limiting

Auth actions call `checkRateLimit` from `lib/rate-limit.ts`.
The default provider is process-local (`InMemoryRateLimitProvider`).
It is **not** distributed protection. Replace via `setRateLimitProvider`
with a shared backend (e.g. Redis) before multi-instance production.

## Known limitations
In-memory rate limiter; no email verification; no password reset; invite acceptance UI deferred.


## Public profiles (Phase 2)

- Public DTOs never include password hashes, session data, or membership IDs.
- Visibility is enforced in query layer, not only UI.
- Suspended users, memberships, organizations, and verification-suspended profiles are hidden.
- Profile updates resolve membership from the session; clients cannot choose arbitrary membership IDs for write authorization.


## Phase 2 profile security

- `canHoldAgentProfile`: OWNER | ADMIN | AGENT (explicit; no isAgent flag).
- Public DTOs select explicit fields only — never password hashes, session data, membership IDs, or org UUIDs.
- Cross-tenant post/profile writes return NotFound (non-disclosure).
- Organization profile: ADMIN/OWNER; organization verification: OWNER only.
- Post visibility transitions validated; publishedAt preserved across archive/re-publish.


## Phase 3 conversation security

- Cross-tenant conversation access returns NotFound.
- Assignment only to active same-org memberships; one active assignment enforced at DB level.
- Read-state message IDs cannot reference another conversation.
- Internal notes are never returned from message list APIs.
- Audit writes can share the domain transaction so rollbacks remove audit rows too.


## Customer merge & attributes (Phase 4 hardening)

- Concurrent merges serialize via `SELECT … FOR UPDATE` with sorted lock order.
- MERGED customers excluded from default list; cannot be updated or re-merged as source.
- Tag and attribute operations require same-organization definitions.
- BOOLEAN attributes reject non-boolean coercion.
- Activity payloads expose only approved meta fields.


## Phase 5 AI security

- All AI ops authorize via conversation/customer org membership (NotFound on cross-tenant)
- OPENAI_API_KEY never exposed to clients
- Prompts separate system instructions from untrusted transcript/profile data
- AI output validated with Zod before use
- Audit events record generation ids/types without full conversation bodies
- Missing AI config → ConfigurationError (503), does not break non-AI features


## AI composite FKs & suggestion atomicity

- `ai_generations` / `ai_suggestions` use composite FKs on (organization_id, conversation_id|customer_id|generation_id)
- Suggestion resolution: `UPDATE … WHERE status = 'PENDING' RETURNING` inside a transaction with audit
- Concurrent ACCEPT/REJECT: exactly one succeeds


## Channel credential encryption

- Algorithm: AES-256-GCM
- Key: `CHANNEL_SECRETS_KEY` (base64 32-byte) from environment only
- Ciphertext version prefix `v1:`
- Missing key → ConfigurationError; never store plaintext tokens in DB for WhatsApp installs


## Phase 12 — Enterprise security

### Capability matrix
Server-side permissions in `lib/authz/permissions.ts` map OWNER / ADMIN / AGENT
to explicit capabilities (`channels.manage`, `analytics.export`, etc.).
UI visibility is not authorization.

### Session rotation
Successful login creates a new session and revokes other active sessions for
that user (`revokeOtherSessions`), reducing risk from stolen session cookies.

### Production secrets
`CHANNEL_SECRETS_KEY` is required when `NODE_ENV=production`.

### HTTP security headers
`next.config.ts` sets CSP (compatible with Next), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Cache-Control: no-store`
for API routes. `poweredByHeader` is disabled.

### Rate limits
Auth, web-chat, and analytics export use `checkRateLimit`. Default store is
process-local; production multi-instance deployments must inject a shared provider.

### Webhooks
WhatsApp webhook verification remains signature + installation scoped. Requests
are never authorized solely by client-supplied organization IDs.


## Authorization surface map (Phase 12)

| Surface | Auth model |
| --- | --- |
| `/api/analytics*` | Session + `analytics.view` / `analytics.export` + org membership |
| `/api/channels/*`, WhatsApp install | Session + `channels.view`/`channels.manage` + admin role in domain |
| `/api/automations*` | Session + `automations.view`/`automations.manage` + admin in domain |
| `/api/conversations*`, `/api/customers*` | Session + active membership; resource org-scoped domain guards |
| `/api/ai/*` | Session + membership via domain AI services |
| `/api/web-chat/installations*` | Session + admin domain checks |
| `/api/web-chat/session|messages|events` | Public widget model: installation key + origin + visitor token |
| `/api/webhooks/whatsapp` | Provider signature + installation binding (not session) |
| Server actions (auth) | Rate-limited; no resource IDOR surface |

Public-by-design endpoints never authorize solely by client `organizationId`.


## Phase 12 production gate

Verified on GitHub Actions CI (`ci.yml`):

- postgres service + migrations
- typecheck
- lint
- full vitest suite (includes security-matrix + security-phase12)
- production build (`next build --turbopack`)

Rate limiting remains process-local by design until shared infrastructure is provisioned.
