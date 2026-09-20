# CONVORA architecture

Status: Phase 2 (hardened) — public identity (agent & organization profiles).

## Identity model

```
User → Membership (role + status) → Organization
                ↓
         Agent profile (per membership)
Organization → Organization profile (1:1)
```

An agent is **not** a separate login. Agent profiles attach to memberships.

### Who may hold an agent profile

`canHoldAgentProfile(role)` is true for **OWNER**, **ADMIN**, and **AGENT**.

Rationale: organization representatives (including the founding OWNER) may maintain a public professional identity for that membership. There is no separate `isAgent` boolean — `membership.role` remains authoritative.

### Multi-organization users

A user may have memberships in multiple organizations. Each membership may have its own agent profile, username, posts, and verification state.

## Public identity

| Surface | Route | Auth |
| --- | --- | --- |
| Agent | `/agents/[username]` (`/@username` rewrite) | Public |
| Organization | `/org/[slug]` | Public |
| Manage agent | `/app/profile` | Session |
| Manage org profile | `/app/organization/profile` | Session + ADMIN/OWNER |

### Public visibility chain (agent)

User ACTIVE ∧ Membership ACTIVE ∧ Organization ACTIVE ∧ Profile PUBLIC ∧ verification ≠ SUSPENDED

Private / inactive states return **not found** (no existence leak).

### Verification (administrative)

Statuses: `UNVERIFIED | PENDING | VERIFIED | SUSPENDED`.

Allowed transitions are finite (see `lib/profiles/verification.ts`). Posts never imply verification.

- Agent verification: ADMIN or OWNER of the organization
- Organization verification: OWNER only (Phase 2)

### Posts

Visibility: `DRAFT | PUBLIC | ARCHIVED`.

`publishedAt`: set on first PUBLIC; preserved on archive and re-publish.

## Sessions & tenancy

Unchanged from Phase 1. Never trust browser-supplied org/membership IDs for authorization.

## Out of scope

Conversations, channels, inbox, AI, CRM, billing (later phases).
