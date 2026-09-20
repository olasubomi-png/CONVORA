# CONVORA architecture

Status: Phase 0 foundation. Domain tables, adapters, and product features are not implemented.

## Purpose

CONVORA is the communication layer between organizations and the people they serve. Organizations receive conversations from multiple channels into one operational system that agents work from.

## Core concepts

These concepts are product and domain language. They are not database tables yet.

- **User** — a person with credentials who can sign in.
- **Organization** — the tenant. Every operational resource belongs to one organization.
- **Membership** — the relationship between a user and an organization, including role.
- **Agent** — a membership with permission to work conversations.
- **Customer** — a person an organization communicates with.
- **Conversation** — a thread of communication with a customer across one or more channels.
- **Message** — a single inbound or outbound item in a conversation.
- **Channel** — a connected transport such as WhatsApp, email, or a website widget.

## Future relationship model

```
Organization
 ├── Members
 ├── Customers
 ├── Conversations
 │    ├── Messages
 │    └── Assignment
 ├── Channels
 └── Settings
```

Authorization will always start from the authenticated user and their memberships. Organization identifiers supplied by the browser are never authoritative.

## Communication architecture

```
WhatsApp
Facebook
Instagram
Email
Website Widget
SMS
       ↓
Channel adapters
       ↓
CONVORA conversation engine
       ↓
Shared inbox
       ↓
Agents
```

Channel adapters translate provider-specific payloads into CONVORA conversation events. The conversation engine must not import WhatsApp, Meta, or carrier SDKs.

Adapters own:

- webhook verification
- provider authentication
- payload mapping
- delivery retries specific to that provider

The core owns:

- conversations and messages
- assignment and inbox state
- organization scoping
- audit events

## Request flow (future)

```
request
  → authenticated user
  → organization membership
  → authorized resource
```

Not:

```
browser → organizationId → database
```

## Current technical layers

- `app/` — Next.js App Router routes and UI
- `components/` — presentational UI
- `lib/` — environment, errors, validation, utilities
- `db/` — Drizzle client and schema (empty domain schema in Phase 0)
- `docs/` — architecture, security, and development notes
- `tests/` — unit tests now and Playwright configuration

## Validation principle

```
Client input
    ↓
Validation
    ↓
Domain logic
    ↓
Database
```

TypeScript types do not validate runtime input.
