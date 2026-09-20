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
