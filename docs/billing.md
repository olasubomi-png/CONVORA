# CONVORA Billing

## Plans (NGN)

| Plan | Monthly | Yearly (20% off) |
| --- | --- | --- |
| Starter | ₦6,799 | ₦65,270 |
| Premium | ₦15,999 | ₦153,590 |

Amounts stored as **integer kobo** (`monthly_amount_minor`, `yearly_amount_minor`).
Yearly = `floor(monthly_kobo * 12 * 8000 / 10000)` with `yearly_discount_bps = 2000`.

## Trial

New organizations receive one **14-day TRIALING** subscription on **Premium** entitlements.
Created atomically with the organization. Unique `organization_id` on subscriptions prevents duplicates.

When `trial_ends_at` is past, status becomes **EXPIRED** and entitlements stop until a paid **ACTIVE** subscription exists.

## Entitlements

Machine keys (not `if (plan === "PREMIUM")`):

- `channel.facebook` / `channel.web_chat` / `channel.whatsapp` / `channel.instagram`
- `ai.enabled` / `ai.monthly_limit` (Starter **100**, Premium **2000** generations/month)
- `automation.enabled` / `analytics.advanced`
- `agents.max` / `customers.max` / `conversations.monthly_limit`

Resolve via `getEffectiveEntitlements` / `hasEntitlement` / `requireEntitlement`.

## Usage

`usage_meters` per org + meter + calendar month. `consumeUsage` uses conditional SQL update so concurrent requests cannot exceed the limit.

## Payment provider

`lib/billing/provider.ts` is an abstraction. **Paystack is not integrated in this phase.**
Do not mark subscriptions ACTIVE from the client. Checkout belongs to the payment integration step.

## Subscription states

`TRIALING` → `EXPIRED` (trial end) | `ACTIVE` (verified payment) | `PAST_DUE` | `CANCELED`
