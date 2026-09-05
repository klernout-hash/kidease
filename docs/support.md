# Support desk scaffold

One **Case** object plus a timeline. Not another scatter of admin tabs.

`/support` is staff-only (inbox + `/support/$caseId`). Public Help Centre lives at **`/help`** (Apple / Google store support URL). `/contact` is unchanged.

## Roles

`profiles.role` — do not invent a second auth table.

| Role | Desk | Live refunds |
| --- | --- | --- |
| `support` | `/support` (not `/admin`) | Capped by `SUPPORT_REFUND_MAX_CENTS` (default 10000 = $100 CAD) |
| `support_lead` | `/support` (not `/admin`) | Unlimited |
| `admin` | `/admin` + `/support` | Unlimited |

Promote:

```sql
update profiles set role = 'support' where user_id = '…';
update profiles set role = 'support_lead' where user_id = '…';
```

`canAccessSupport(user)` is admin **or** `support` / `support_lead`. `/admin*` tools still call `requireAdmin` — support cannot hit them.

## Inbox email

Canonical Support case inbox: **support@kidease.ca** (`SUPPORT_INBOX_EMAIL` in `src/lib/support.ts`).

- **Refunds** are a `billing` case type on that inbox. Do not stand up `refund@`.
- **Person mailboxes** (`kevin@kidease.ca` and similar) are not the case router.
- Public Help Centre / contact still offers kyle@kidease.ca until you point visitors at support@.
- Platform notify for `kind: "support"` still delivers to `ADMIN_EMAIL` (kyle@) until ops points Resend/Titan at support@. Do not treat that as a second case inbox.

## Cloudflare Access (ops)

Access already guards `/admin*` on `www.kidease.ca`. **Add `/support*` to the same Access application** when you are ready (path `/support` and `/support/*`). Until then, the app gate + 2FA is the boundary.

Preview hosts (`*.vercel.app`) 302 `/support*` to `https://www.kidease.ca/support*` so Access can apply on the canonical host — same pattern as `/admin*`. Public `/help` stays on the preview host.

## Refunds

- `stripeChargesLive()` (only `sk_live_`) **and** a payment intent / charge id → Stripe Refunds API with an idempotency key. Case event + audit. Bill status still comes from the existing `charge.refunded` webhook — this path does not mark Paid / Refunded.
- Not live → honest stub **“Refund rehearsed — Stripe not live”**. Case event only. No fake paid state.
- Env: `SUPPORT_REFUND_MAX_CENTS` (server-only, never `VITE_`). Agents only. Leads and admins skip the cap.

## View-as

Banner-only: `/parent?preview=support` and `/provider?preview=support`. Writes an audit row. The agent is still themselves. **TODO:** read-only impersonation is unsafe until writes are scoped; do not add write impersonation.

## Vercel env checklist

| Name | Notes |
| --- | --- |
| `SUPPORT_REFUND_MAX_CENTS` | Optional. Agent live-refund cap in cents. Default 10000. |
| `STRIPE_SECRET_KEY` | Live refunds only when `sk_live_`. Same key as Bills. |
| `ADMIN_EMAIL` | Admin bootstrap only. Does not create support agents. |

Never commit secret values.

## Later (not this PR)

- Cloudflare Access path `/support*`
- Point App Store / Play Console support URL at `https://www.kidease.ca/help` if it still says `/support`
- Email/SMS events on the timeline (kinds exist; composers do not)
- Real read-only impersonation
