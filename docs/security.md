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
