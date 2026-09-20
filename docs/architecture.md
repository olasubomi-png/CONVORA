# CONVORA architecture

Status: Phase 4 — customer intelligence layer.

## Layers

```
WhatsApp / Facebook / Instagram / Email / SMS / Web Chat
                    ↓  (future adapters)
            Channel Adapter Layer
                    ↓
         CONVORA Conversation Engine
                    ↓
              Shared Agent Inbox
```

External channel adapters are **not** implemented in Phase 3.

## Tenancy

Organization is always the security boundary.

User → Membership → Organization → Customers / Conversations / Tags

## Conversation domain

```
Organization
  ├── Customer
  └── Conversation
        ├── Participants (CUSTOMER | AGENT)
        ├── Messages
        ├── Internal notes (staff only)
        ├── Assignments (history)
        ├── Tags
        └── Read state (per membership)
```

### Status lifecycle

- `OPEN` — active
- `PENDING` — waiting
- `CLOSED` — resolved; may reopen to `OPEN`

### Priority

`NORMAL | HIGH | URGENT`

### Channel labels

`WEB | WHATSAPP | FACEBOOK | INSTAGRAM | EMAIL | SMS | OTHER` — source labels only.

### Authorization (Phase 3)

| Action | AGENT | ADMIN | OWNER |
| --- | --- | --- | --- |
| View org conversations | ✓ | ✓ | ✓ |
| Send messages | ✓ | ✓ | ✓ |
| Internal notes | ✓ | ✓ | ✓ |
| Assign to self | ✓ | ✓ | ✓ |
| Assign to others | | ✓ | ✓ |
| Status / priority | ✓ | ✓ | ✓ |
| Tags | ✓ | ✓ | ✓ |

Cross-tenant access returns **NotFound**.

### Public profile boundary

Phase 2 public profiles do not expose conversations. Full anonymous web-chat identity and abuse protection are deferred to later phases.

## Phase history

0 Foundation · 1 Identity · 2 Public profiles · 3 Conversation engine (current)

## Out of scope

Channel APIs, AI, billing, analytics, real-time websockets, file storage.


## Phase 3 hardening notes

- **Assignments:** partial unique index on active rows (`unassigned_at IS NULL`); `SELECT … FOR UPDATE` on conversation during assign/unassign.
- **Message pagination:** opaque time+id cursors; deterministic `(createdAt, id)` ordering; `before` / `after` supported.
- **Inbox list:** ordered by `coalesce(lastMessageAt, createdAt) DESC, id DESC` with the same cursor scheme.
- **Read state:** message IDs must belong to the conversation; per-membership only.
- **closedAt:** set on transition to CLOSED; cleared on reopen to OPEN.
- **Audit:** `recordAuditEvent(input, executor?)` participates in domain transactions when a tx is passed.


## Customer intelligence (Phase 4)

Customers belong to an **organization**, not an agent.

- Org-scoped email uniqueness (nullable emails allowed; non-null unique per org)
- Shared org tag catalog (`conversation_tags`) linked via `customer_tag_links`
- Custom attributes: TEXT | NUMBER | BOOLEAN | DATE | SELECT
- Internal notes (`customer_notes`) — staff only
- Activity timeline from audit events filtered by `customerId`
- Stats derived from conversations/messages
- Merge (OWNER/ADMIN): reassigns conversations/notes/tags/attributes; retires source record

Identity is not global: the same person may exist in multiple organizations as separate customer rows.

### Customer lifecycle

- `ACTIVE` — appears in lists and accepts updates
- `MERGED` — retired; `mergedIntoCustomerId` points at canonical; excluded from default lists
- Merge locks both rows (`FOR UPDATE`, deterministic ID order); rejects already-merged sources
- Attribute BOOLEAN accepts only true/false (and string forms); SELECT validated against options
- Activity timeline filters event types in SQL before pagination


### Database tenant integrity (Phase 4 final)

- `customers(organization_id, id)` unique; `merged_into_customer_id` self-FK
- `customer_tag_links.organization_id` + composite FKs to customer and tag
- `customer_attribute_values.organization_id` + composite FKs to customer and definition
- Email policy: trim + lowercase; unique among ACTIVE non-null emails per org


## Web Chat channel (Phase 6)

Embeddable visitor chat that feeds the existing Conversation Engine (`channel = WEB`).

Customer site → `widget.js` → public Web Chat APIs → Conversation Engine → Shared Inbox → optional AI

- **Installation**: org-scoped, public key identifier (not a secret), allowed origins, branding config
- **Visitor session**: server-issued token (SHA-256 stored); maps to customer + conversation
- **Visitor session**: 32-byte random token; only SHA-256 stored; TTL 30 days (`expiresAt`); bound to installation+org
- **Message idempotency**: unique `(conversation_id, client_message_id)` table
- **Realtime**: visitor→server HTTP; server→visitor **polling** (3s) with `?after=` cursor — not true push
- **Widget isolation**: closed Shadow DOM; HTML-escaped messages; accentColor whitelist
- **Widget isolation**: root container + scoped CSS; message text HTML-escaped
- AI remains human-approved only


## WhatsApp Cloud API (Phase 8)

WhatsApp is a **provider adapter** around the CONVORA Conversation Engine, not a separate conversation system.

```
WhatsApp Cloud API → Webhook → WhatsAppCloudAdapter
  → NormalizedInboundMessage → Channel Layer → Conversation Engine
```

- Provider: `whatsapp_cloud` · Channel: `WHATSAPP`
- Credentials: AES-256-GCM (`CHANNEL_SECRETS_KEY`), format `v1:iv:ciphertext+tag`
- Webhook: `GET/POST /api/webhooks/whatsapp` — HMAC-SHA256 `X-Hub-Signature-256` on raw body
- Conversation reuse: open conversation for org + customer + channel WHATSAPP
- Inbound idempotency: provider message id as `externalEventId`
- Outbound: text only; media outbound returns typed unsupported error
- Media inbound: placeholder text + metadata (no media download yet)


## Installation-scoped adapters

Credentialed provider adapters are **installation-scoped** and must never be
stored as globally mutable provider-level instances.

```
Provider registry (mock / capability only)
      ↓
Installation credentials (decrypted server-side)
      ↓
Installation-scoped adapter instance
      ↓
verify / parse / send
```

WhatsApp `phone_number_id` is stored as `provider_resource_id` (unique per provider)
for O(1) webhook routing.


## Team Operations (Phase 9)

- **Presence**: ONLINE | AWAY | OFFLINE per membership; heartbeat only refreshes ONLINE lastSeenAt
- **Teams**: org-scoped; memberships reference organization memberships (MEMBER | LEAD)
- **Assignment**: existing FOR UPDATE + partial unique active assignment; history table append-only
- **Watchers**: many per conversation; not assignees
- **Workload**: aggregate queries (unassigned, per-agent active counts)
- TEAM LEAD is not ADMIN; team admin actions remain OWNER/ADMIN only in Phase 9


## Automation Engine (Phase 10)

```
Domain Event → emitAutomationEvent → match enabled rules (priority ASC, id ASC)
  → evaluate structured conditions → execute safe actions → execution row + audit
```

- **Idempotency**: unique `idempotencyKey = sha256(org:rule:eventKey)`
- **Loop protection**: `MAX_AUTOMATION_DEPTH = 3`; deeper emissions skipped
- **No eval / user code / external messaging**
- **Authz**: OWNER/ADMIN manage rules; members can list


### Automation execution semantics (Phase 10 hardened)

- Actions run sequentially within one rule execution; a thrown error marks the execution FAILED.
- Assignment actions use their own FOR UPDATE transaction (compatible with Conversation Engine locks).
- Idempotency is enforced by unique `idempotency_key`.
- Depth limit 3 stops recursive chains.
- Notes are authored as the rule creator membership with an `[automation]` body prefix (never customer-facing).
