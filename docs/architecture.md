# CONVORA architecture

Status: Phase 1 — identity, organizations, and memberships.

## Identity model

```
User → Membership (role + status) → Organization
```

- **User** — CONVORA account (email + Argon2id password hash).
- **Organization** — primary tenant boundary (unique slug).
- **Membership** — user↔organization with role `OWNER | ADMIN | AGENT` and status `ACTIVE | INVITED | SUSPENDED | REMOVED`.

Ownership is the `OWNER` membership role (partial unique index: one non-REMOVED owner per org). An agent is a user with membership, not a separate auth table. Phase 2 may add `agent_profiles` without changing identity.

## Sessions

Opaque token → SHA-256 hash in `sessions` → HTTP-only cookie `convora_session` (Secure in production, SameSite=Lax, 14-day expiry, revocable).

## Authorization

```
request → session → user → active membership → role check → resource
```

Never trust browser-supplied organizationId. Only ACTIVE memberships in ACTIVE organizations authorize access.

## Channel architecture (future)

Providers → channel adapters → conversation engine → shared inbox → agents. Adapters stay isolated from core domain.

## Validation

Client input → Zod → domain logic → database.
