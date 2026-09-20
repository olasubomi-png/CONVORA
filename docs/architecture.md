# CONVORA architecture

Status: Phase 3 — conversation engine & shared inbox foundation.

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
