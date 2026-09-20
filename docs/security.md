# CONVORA security principles

## Multi-tenancy
Organization is the security boundary. Derive tenant from session + membership, never from client-supplied IDs alone.

## Authentication
Argon2id passwords. Hashed session tokens. HTTP-only cookies. Rate limits on register/login (in-memory; replace with Redis for multi-instance).

## Authorization
`requireAuthenticatedUser`, `requireActiveMembership`, `requireOrganizationRole`. Suspended/removed memberships are not active.

## Audit
`audit_events` for USER_REGISTERED, USER_LOGIN, USER_LOGOUT, ORGANIZATION_CREATED, membership events. No secrets in payloads.

## Known limitations
In-memory rate limiter; no email verification; no password reset; invite acceptance UI deferred.
