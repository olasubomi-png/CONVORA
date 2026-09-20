# CONVORA security principles

Status: Phase 0. Authentication and authorization are not implemented. These rules constrain later work.

## Multi-tenancy

Every organization-owned resource must be scoped to an organization.

Never trust an organization ID supplied by the browser.

Authorization must determine the organization from authenticated server-side context.

```
request
  ↓
authenticated user
  ↓
organization membership
  ↓
authorized resource
```

Not:

```
browser → organizationId → database
```

A query that filters only by a client-provided `organizationId` is incorrect even if the user is authenticated.

## Server-side authorization

- Authorization checks run on the server.
- UI hiding is not an access control.
- Every mutation and query that touches tenant data must prove membership and permission first.

## Input validation

- Untrusted input is validated with Zod at the application boundary.
- TypeScript types are not a substitute for runtime validation.
- Reject unexpected fields where it reduces risk.

## Secret management

- Secrets live in environment variables, never in source control.
- `.env` files are gitignored. Only `.env.example` is committed, with placeholders.
- Server-only values such as `DATABASE_URL` must not be imported into Client Components.
- Rotate credentials if they are exposed.

## Password hashing (future auth)

- Store only slow, salted password hashes (for example Argon2id).
- Never log passwords, reset tokens, or session secrets.
- Enforce minimum password strength at the validation boundary.

## Session security (future auth)

- Prefer httpOnly, secure, SameSite cookies for session identifiers.
- Bind sessions to the user and, where applicable, the active organization membership.
- Invalidate sessions on password change and explicit sign-out.
- Use short-lived tokens if bearer tokens are introduced later.

## CSRF

- Cookie-authenticated mutations must be protected against cross-site request forgery.
- SameSite cookie attributes reduce risk but are not the only control.
- State-changing routes must not rely on CORS alone.

## Rate limiting

- Authentication, password reset, and public intake endpoints require rate limits.
- Channel webhooks should reject unverified traffic cheaply.
- Limits should be keyed by identity where known, otherwise by network origin.

## Audit logging

- Record security-relevant events: sign-in failures, membership changes, permission changes, channel connection changes.
- Logs must include actor, organization, action, and time.
- Do not write secrets, message bodies with credentials, or full raw provider payloads into general logs.

## Secure headers

- Do not send `X-Powered-By`.
- Set a restrictive Content-Security-Policy as routes are introduced.
- Use `Referrer-Policy`, `X-Content-Type-Options`, and frame protections appropriate to the app.

## Least privilege

- Database credentials used by the app should have only the permissions the app needs.
- Channel credentials are organization-scoped and never shared across tenants.
- Service-to-service credentials are separate from user sessions.

## Data isolation

- Tenant data is isolated by organization at the query layer.
- Shared infrastructure (one database) is acceptable only with strict scoping and tests that prove isolation.
- Background jobs must carry organization context explicitly.

## Safe error messages

- Clients receive stable error codes and non-sensitive messages.
- Database errors, stack traces, and internal identifiers stay on the server.
- `InternalError` is never exposed with its original message.

## Logging without sensitive data

- Do not log `DATABASE_URL`, session cookies, authorization headers, or password fields.
- Redact customer contact details in default application logs unless a dedicated, access-controlled audit store requires them.
