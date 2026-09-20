# CONVORA architecture

Status: Phase 2 — public identity (agent & organization profiles).

## Identity model

```
User → Membership (role + status) → Organization
                ↓
         Agent profile (per membership)
Organization → Organization profile (1:1)
```

An agent is **not** a separate login. It is a user with an organization membership and an optional `agent_profiles` row bound to that membership (supports multi-org users).

## Public identity

| Surface | Route | Auth |
| --- | --- | --- |
| Agent | `/agents/[username]` (also `/@username` via rewrite) | Public |
| Organization | `/org/[slug]` | Public |
| Manage agent | `/app/profile` | Session |
| Manage org | `/app/organization/profile` | Session + ADMIN/OWNER |

Public visibility requires the full active chain:

User ACTIVE · Membership ACTIVE · Organization ACTIVE · Profile PUBLIC · verification ≠ SUSPENDED

Private profiles return not-found (no existence leak).

## Verification

Statuses: `UNVERIFIED | PENDING | VERIFIED | SUSPENDED`.

Posts do **not** imply verification. Verification is administrative (OWNER/ADMIN for agents; OWNER for org verification in Phase 2).

## Activity

`agent_posts` support professional activity (`DRAFT | PUBLIC | ARCHIVED`). Not a social network — no likes, comments, or feeds.

## Sessions & tenancy

Unchanged from Phase 1: opaque sessions, membership-scoped authorization, never trust browser-supplied org/membership IDs for authorization.

## Out of scope (later phases)

Conversations, channels (WhatsApp/Facebook/…), inbox, AI, CRM, billing.
