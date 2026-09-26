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

The login widget is the **managed / checkbox** challenge (`appearance: "always"`). Parent, Daycare, Admin, `/fr/login`, sign-up, forgot/reset password, 2FA, and the password reauth dialog all mount `TurnstileField` so the Cloudflare button is visible when both keys exist. Do not switch back to `interaction-only` — that hid the checkbox on most Production logins.

The host div must **not** use class `cf-turnstile`. An implicit `api.js` (no `render=explicit`) auto-renders that class **without** the React callback. The checkbox can show Success while Sign in stays disabled because React never received the token. The widget also mirrors the hidden `cf-turnstile-response` input, and the auth POST sends the token as `x-turnstile-token`, `x-captcha-response`, `cf-turnstile-response`, and JSON `turnstileToken` so a proxy that strips one header still siteverifies.

Preview without keys stays `off` (widget hidden, server skips). Preview with keys is `optional` (widget shows; missing token is allowed). Production with both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` **enforces** siteverify. Capacitor uses the same www keys (`https://www.kidease.ca`); do not invent a native site key.

## Stuck on “Opening your desk…” after Turnstile Success

Two app bugs stacked with Cloudflare challenges (fixed in the login client):

1. **Success did not enable Sign in.** `turnstile.reset()` can call the success callback before it returns. The old code cleared React state *after* reset, so the checkbox stayed on Success and the button stayed disabled (`turnstileRequired && !token`).
2. **Admin soft-continue looped.** `/login?role=admin&desk=admin&intent=admin&next=/admin` with any Better Auth session set `busy` and the lead to “Opening your desk…”. If the idle cookie was stale, the effect set `continued` back to false, which started the same path again and cleared the error. A hung `POST /api/auth/sign-out`, `POST /api/auth/sign-in/email`, or `/_serverFn` (Managed Challenge on XHR never completes) never left `busy`.

After the fix, those hops time out, the form shows an error, and Retry stays on the password form instead of re-arming the spinner. Cloudflare Access on `/admin` is unchanged.

### Kyle — Cloudflare dashboard (do these clicks)

Zone **kidease.ca** (covers `www`). Do **not** put the whole site under Access, Bot Fight, or “I'm Under Attack”.

1. **Security → WAF → Custom rules → Create rule.** Name: `Allow KidEase auth`.
   Expression (Edit expression):

   ```
   (starts_with(http.request.uri.path, "/api/auth/")) or
   (starts_with(http.request.uri.path, "/_serverFn/")) or
   (http.request.uri.path eq "/login") or
   (http.request.uri.path eq "/fr/login") or
   (http.request.uri.path eq "/forgot-password") or
   (http.request.uri.path eq "/reset-password") or
   (http.request.uri.path eq "/verify-2fa")
   ```

   Action: **Skip**. Check **Super Bot Fight Mode**, **Browser Integrity Check**, **Security Level**, and **User Agent Blocking**. Do **not** choose **Block** or **Managed Challenge** for these paths. Managed Challenge on a `fetch()` to `/api/auth/*` or `/_serverFn/*` never shows a checkbox — the browser hangs on “Opening your desk…”.
2. **Security → Bots.** If **Bot Fight Mode** is on for the zone, turn it off (it challenges API POSTs and cannot skip by path). Use Super Bot Fight only with the skip rule above. Security Level stays **Medium**, not “I'm Under Attack”.
3. **Turnstile → the KidEase widget.** Mode **Managed** (checkbox), not Invisible. Hostnames: `kidease.ca` and `www.kidease.ca`. Leave **Pre-clearance off** so the widget does not also mint a `cf_clearance` that Bot Fight then demands on the auth POST. Env (Vercel Production, server only, no `VITE_` prefix): `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Both set → production **enforces** siteverify. Unset either → widget off. No second native site key.
4. **Zero Trust → Access → Applications.** Keep the staff app on `www.kidease.ca` only, path include list **only**:

   | Path | Why |
   | --- | --- |
   | `/admin` and `/admin/*` | Admin desk |
   | `/admin-contracts` and `/admin-contracts/*` | Contracts |
   | `/admin-chat` and `/admin-chat/*` | Chat lab |
   | `/api/admin/*` | Admin JSON |

   **Do not** include `*`, `/`, `/login`, `/parent`, `/provider`, `/api/auth/*`, `/api/auth/callback/*`, or `/_serverFn/*`. Google SSO lands on `/api/auth/callback/google` — Access there drops the session before the desk opens. If a second application matches the whole hostname, disable it or narrow it. Session duration 24h. Cookie SameSite **Lax** on `www.kidease.ca` (not Path=/admin only).
5. Hard-refresh `https://www.kidease.ca/login` after the skip rule is live. DevTools: `POST /api/auth/sign-in/email` and `GET /api/auth/callback/google` must be JSON or a redirect from the app, not `Attention Required` HTML and not `cloudflareaccess.com`.

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

Parent / Daycare login also refuse leftover `/admin` or `/support` destinations (`resolvePostLoginPath` + `assignPostAuthDest`). A parent `?role=` / `?desk=` must not paint the operator email-first form (`isAdminLoginIntent`) or full-document-assign into Access. Admin still uses a real document GET to `/admin` so Access can run once. Do not disable Access on `/admin*`.

## robots.txt Content-Signal (Lighthouse SEO)

Origin `public/robots.txt` is standard robots exclusion only (`User-agent`, `Allow`, `Disallow`, `Sitemap`). Production used to serve a Cloudflare-managed prefix:

```
Content-Signal: search=yes,ai-train=no,use=reference
```

Lighthouse SEO treats `Content-Signal` as an unknown / invalid robots directive.

**Dashboard fix (not this repo):** [Cloudflare Dashboard](https://dash.cloudflare.com) → zone **kidease.ca** → **AI** / **AI Crawl Control** / **Content Signals**. Turn **off** “Add content signals to robots.txt” (or Managed robots.txt). After it drops, `https://www.kidease.ca/robots.txt` must match git: no `Content-Signal` line.

Bot-specific `Disallow` rules for GPTBot / CCBot / etc. can stay in AI Crawl Control without writing `Content-Signal` into robots.txt.

## AI crawlers (GPTBot / Google-Extended) — ops follow-up

This repo does not change Cloudflare **AI Crawl Control**. For Search / GEO growth, Kyle should review the zone console and allow the bots KidEase wants to train or cite from public marketing + listing pages:

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → zone **kidease.ca** → **AI** → **AI Crawl Control**.
2. Confirm **GPTBot** and **Google-Extended** are allowed (or at least not blocked) for `www.kidease.ca` public HTML.
3. Keep admin / support / test listing paths out of that grant if the product offers path exceptions; otherwise rely on `robots.txt` `Disallow` for `/admin*`, `/support`, and the ghost listing.
4. Do **not** turn “Add content signals to robots.txt” back on.

App-side sitemap and robots already advertise `https://www.kidease.ca/sitemap.xml` and `https://www.kidease.ca/sitemap-listings.xml` (the latter is a sitemap index of paginated listing urlsets).

## Cache so open and photos stay fast

The app no longer waits on catalogue SQL before it sends HTML, and listing cards request sized `/img` or `/cdn-cgi/image/` URLs directly in the document. Repeat views stay slow if Cloudflare does not cache those responses. Do this in the dashboard — the repo cannot flip the zone cache.

### `www.kidease.ca` — sized photos (`/img`)

`/img?src=/photos/…&w=480` is a Vercel function (sharp). The origin sends `Cache-Control` and `Cloudflare-CDN-Cache-Control: public, max-age=31536000, immutable` plus `Vary: Accept`. Query-string URLs are not cached until a rule says so.

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → zone **kidease.ca** → **Caching** → **Cache Rules** → **Create rule**.
2. Name: `Cache KidEase sized photos`.
3. If: `http.request.uri.path eq "/img"`.
4. Then: **Eligible for cache**. Cache key: **include query string**. Edge TTL: **Respect origin**. Browser TTL: **Respect origin**.
5. Do **not** cache `/`, `/search`, `/api/*`, or `/_serverFn/*` as a blanket rule. HTML documents stay `max-age=0` so a page never points at a deleted JS hash. Public catalogue and anonymous listing GET `/_serverFn/*` responses send `s-maxage` and `stale-while-revalidate` from the origin; a cache rule may respect that origin header for those GET JSON URLs only. Leave POST server functions, signed-in listing bodies, and every HTML document uncached.

After the rule, a second request for the same `/img?src=&w=` URL should be `cf-cache-status: HIT`.

### `media.kidease.ca` — originals and transforms

1. Same zone → **Caching** → **Cache Rules**.
2. Name: `Cache KidEase media`.
3. If: hostname equals `media.kidease.ca` and path starts with `/photos/` **or** `/cdn-cgi/image/`.
4. Then: **Eligible for cache**. Edge TTL at least a day (originals are immutable object keys). Include the full path. Transforms must vary on the width in the path (it is already in the URL).
5. **Images → Transformations** must be on before `VITE_CF_IMAGE_RESIZE=1`. Until that smoke test passes, leave the flag unset — the app uses `/img` and falls back to the original `https://media.kidease.ca/photos/…` URL. Steps are in `docs/image-resizing.md`.

### What stays outside the app

- Vercel cold starts still delay the first HTML byte. Provisioned concurrency is a Vercel setting, not a code change.
- Turning on image transformations is the dashboard flag above. The app will not request `/cdn-cgi/image/` until `CF_IMAGE_RESIZE` and `VITE_CF_IMAGE_RESIZE` are both `1`.
