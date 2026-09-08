# Cloudflare in front of KidEase

`www.kidease.ca` sits behind Cloudflare, then Vercel. Better Auth lives at **`/api/auth/*`**. TanStack server functions live at **`/_serverFn/*`**.

## Do not block first-party auth POSTs

Production browser QA (2026-09-08): Parent / Daycare / Operator email sign-in all showed **“Sign-in failed.”** DevTools showed:

```
POST https://www.kidease.ca/api/auth/sign-in/email → 403
```

Response body was Cloudflare HTML (`Attention Required! | Cloudflare` / `Sorry, you have been blocked.`), not Better Auth JSON. Forgot-password failed the same way. The login page also had no Turnstile widget and no Google button — those load through `/_serverFn/*`, which the same filter can block.

**Primary fix (Cloudflare dashboard, not this repo):**

1. Security → WAF / Bot Fight / Super Bot Fight / custom rules for `kidease.ca` and `www.kidease.ca`.
2. **Skip, allow, or at most Managed Challenge** — do not **Block** — for:
   - `/api/auth/*` (especially `POST /api/auth/sign-in/email`, sign-up, forget-password, reset-password, get-session)
   - `/_serverFn/*` (Turnstile site key + Google/Apple/Facebook button list)
3. Keep Bot Fight on the marketing pages if you want. The auth API is a same-origin JSON POST from the login form; treating it as a bot breaks every password sign-in.
4. After the skip is live, hard-refresh `/login`. Parent Sign In should return Better Auth JSON (200 or a real credential error), not CF HTML.

KidEase cannot exempt itself from a WAF block — the request never reaches Vercel.

## What the app does

When an auth fetch returns CF HTML or a bare `403 Forbidden` with no Better Auth JSON, the login / forgot-password UI shows:

**Security filter blocked sign-in — try again or contact support**

instead of a generic **Sign-in failed.**

## Turnstile “Success!” then “Security check failed”

That red inline copy is **KidEase siteverify**, not a WAF 403. The widget token is single-use. A second POST with the same token (double-click, fetch retry, back/forward cache) used to fail even though the checkbox still said Success. Login remints the widget as soon as the token is sent; the server retries siteverify with a stable `idempotency_key` so a used token is not a false failure.

If the widget never appears, that is still the `/_serverFn/*` WAF skip above.

## Access vs Bot Fight

Cloudflare **Access** still guards `/admin*` (and later `/support*`) — that is a login wall for staff, not a WAF block on `/api/auth/*`. Do not put Access in front of `/api/auth/*` or `/login`. See `docs/support.md`.

## Access application (ops checklist)

Mid-session re-entry to `/admin` showing the Cloudflare Access login wall is almost always the **Zero Trust application path being too broad**, or the Access JWT expiring after a hop through `/login`. KidEase cannot mint that JWT. Do this in the dashboard — do **not** put all of `www` behind Access.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Zero Trust** → **Access** → **Applications**.
2. Open the KidEase staff app (or create one) for **`www.kidease.ca`** only. Leave `kidease.ca` apex as a 308 to www (the app already canonicalizes).
3. **Path include list** (self-hosted / hostname + path). Add only:

   | Path | Why |
   | --- | --- |
   | `/admin` | Admin desk |
   | `/admin/*` | Nested admin |
   | `/admin-contracts` and `/admin-contracts/*` | Contracts desk |
   | `/admin-chat` and `/admin-chat/*` | Chat lab |
   | `/api/admin/*` | Admin JSON |

4. **Do not** add `*`, `/`, `/parent`, `/provider`, `/login`, `/search`, `/api/auth/*`, or `/_serverFn/*`. Those stay public or Better Auth. A site-wide Access app is what forces parents and directors through the staff wall.
5. Optional later: `/support` and `/support/*` on the **same** application (see `docs/support.md`). Still not `/help`.
6. **Session duration:** 24 hours (or longer). Same-origin SPA clicks from Parent → Admin reuse the Access cookie; a 15-minute session looks like a “flap” after any full reload of `/admin`.
7. **Cookie:** same-site `lax` on `www.kidease.ca`. Do not scope the Access cookie to `/admin` only if you also protect `/api/admin/*` — use the application path list above and the default cookie.
8. **Bypass / public rules:** if a second application or WAF custom rule matches `www.kidease.ca/*`, disable it or narrow it. Preview hosts (`*.vercel.app`) are **not** behind Access; the app 302s `/admin*` and `/support*` to `https://www.kidease.ca…` so Access can apply on www.

App-side: `scripts/request-guard.mjs` `isSensitiveDeskPath` is the allow-list that may 302 preview → www. `/parent`, `/provider`, `/login`, `/`, and `/api/auth/*` never go through that hop.
