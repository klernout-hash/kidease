# 1Password Environments for KidEase

Stop scattering production secrets across Vercel, laptop `.env` files, and chat. **1Password Environments** is the canonical store. Vercel keeps a runtime copy. Git keeps **names only**.

This guide does not invent or record secret values. Paste them from the vendor dashboard or from an existing Vercel env — never from this repo.

## How secrets live today

| Surface | What it holds | Status |
| --- | --- | --- |
| [`.env.example`](../.env.example) | Names + comments. Empty values. | In git. Source of *names*. |
| Vercel project **kidease-git** | Encrypted Production + Preview env vars. Runtime for www and previews. | Current deploy source. |
| Laptop `.env` / `vercel env pull` | Plaintext if you pull or copy. | Gitignored (`.env`, `.env.*`). Do not leave these on disk. |
| GitHub Actions CI | No production secrets. `npm test` / e2e use empty env. | Keep it that way. |
| This repo | Never commit `sk_live_`, PEMs, tokens, or connection strings. | Enforced by `.gitignore` + review. |

Vendor-specific name lists already live next to each integration (`docs/sms.md`, `docs/video.md`, `docs/docusign.md`, `docs/inngest.md`, `docs/posthog.md`, `docs/catalog-source.md`, `scripts/r2-photo-migrate.md`). This page is the **single adoption path** so those values are not copied ad hoc.

1Password has no native “sync Environment → Vercel” button. Kyle copies names from 1Password into Vercel (or the other way once, then deletes the plaintext pull). After that, **edit in 1Password first**, then update Vercel.

## Environments to create

In the 1Password desktop app: **Developer → View Environments → New environment**.

| 1Password name | Maps to | What belongs there |
| --- | --- | --- |
| `KidEase Production` | Vercel Production / `www.kidease.ca` | Live Neon, `sk_live_`, Twilio prod, Inngest Cloud, DocuSign production (when you leave demo), R2 `kidease-media`. |
| `KidEase Preview` | Vercel Preview + laptop | Prefer `sk_test_`, DocuSign `demo`, Twilio test, Preview Inngest keys. Same *names*, weaker values. |

Do **not** create a third Environment until you need laptop-only overrides. Do **not** mix `sk_live_` and `sk_test_` in the same Environment.

If an Environment with that exact name already exists, use it — do not create a duplicate.

**Policy:** an Owner/Admin must turn **Environments** on in the 1Password admin console (Policies → Sharing and permissions → Developer permissions) before these screens appear.

## Critical name map

Conceal = 1Password “hide value by default”. Public-by-design keys still stay out of git.

### Neon

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | Production + Preview | Neon connection string. Same key both targets. |
| `CATALOG_SOURCE` | no | both | `auto` / `neon` / `json`. |
| `NEON_CATALOG_MIN_COUNT` | no | both | Auto SoT threshold. |

See `docs/catalog-source.md`.

### Better Auth

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | both | `openssl rand -hex 32`. Not `AUTH_SECRET`. Rotating drops sessions. |
| `BETTER_AUTH_URL` | no | both | Optional origin override. |
| `GOOGLE_CLIENT_SECRET` | yes | both | Pair with public `GOOGLE_CLIENT_ID`. |
| `FACEBOOK_CLIENT_SECRET` | yes | both | Pair with public `FACEBOOK_CLIENT_ID`. |

### Stripe

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | both | Only `sk_live_` turns charges on. |
| `STRIPE_WEBHOOK_SECRET` | yes | both | `whsec_…` |
| `STRIPE_PUBLISHABLE_KEY` | no | both | `pk_…` |
| `STRIPE_CONNECT_CLIENT_ID` | no | both | `ca_…` |
| `STRIPE_PRICE_*` | no | both | `price_…` ids — not secret keys. |

See `docs/store-readiness.md`. Do not put `sk_live_` in Preview.

### Twilio

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | yes | both | `AC…` — SMS + Video. |
| `TWILIO_AUTH_TOKEN` | yes | both | Signature validation even if you send with an API key. |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | yes | both | Preferred send; required for Video tokens. |
| `TWILIO_MESSAGING_SERVICE_SID` | yes | both | `MG…` for Canada. |
| `FEATURE_SMS` / `FEATURE_VIDEO` / `FEATURE_PUSH` | no | both | Stay `0` on Production until secrets exist. Preview may override. |
| `SHOW_PAY_CTAS` | no | both | Stay `0` on Production. Set `1` to restore Upgrade / Subscribe chrome. Stripe code stays. |

See `docs/sms.md` and `docs/video.md`.

### Inngest

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `INNGEST_EVENT_KEY` | yes | both | Cloud Event Key. App boots if unset. |
| `INNGEST_SIGNING_KEY` | yes | both | Cloud HMAC for `/api/inngest`. No query-string secret. |
| `INNGEST_SERVE_ORIGIN` | no | Production | `https://www.kidease.ca` |

See `docs/inngest.md`. The Inngest Vercel integration can *set* these on kidease-git; still copy them into 1Password so they are not only in Vercel.

### PostHog

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `VITE_PUBLIC_POSTHOG_KEY` | no | both | Public project key (pixel class). Still do not commit it. |
| `POSTHOG_HOST` | no | both | `https://us.i.posthog.com` (upstream; browser uses `/ingest`) |
| `POSTHOG_FLAGS_KEY` | yes | both | Optional server flag overlay. Leave unset for env-only flags. |

See `docs/posthog.md` and `docs/flags.md`.

### DocuSign

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `DOCUSIGN_INTEGRATION_KEY` | yes | both | Integration key. |
| `DOCUSIGN_USER_ID` / `DOCUSIGN_ACCOUNT_ID` | yes | both | GUIDs. |
| `DOCUSIGN_PRIVATE_KEY` | yes | both | RSA PEM. On Vercel store newlines as `\n`. |
| `DOCUSIGN_WEBHOOK_SECRET` | yes | both | Connect HMAC. Header only. |
| `DOCUSIGN_ENV` | no | both | Preview = `demo`. |

See `docs/docusign.md`.

### Cloudflare R2

| Name | Conceal | Vercel | Notes |
| --- | --- | --- | --- |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | both | S3 API. Never prefix `VITE_`. |
| `R2_ACCOUNT_ID` / `R2_ENDPOINT` | yes | both | Private API host, not `media.kidease.ca`. |
| `R2_BUCKET` | no | both | Default `kidease-media`. |
| `R2_PUBLIC_BASE_URL` / `VITE_R2_PUBLIC_BASE_URL` | no | both | `https://media.kidease.ca` |

See `scripts/r2-photo-migrate.md`.

Also store (same Environments): `CRON_SECRET`, `SENTRY_DSN`, `TITAN_APP_PASSWORD`, `RESEND_API_KEY` / `SENDGRID_API_KEY`, `TURNSTILE_SECRET_KEY`. Full name list: `npm run ops:1password-checklist`.

**Do not** put `OPERATOR_RESET_PASSWORD` in a long-lived Environment. One-shot on Vercel Production, sign in, delete the var. A 1Password Login item is fine; a mounted `.env` is not.

## Kyle checklist

1. **Turn on Environments** in the 1Password admin console if the Developer → Environments screen is missing.
2. **Create** `KidEase Production` and `KidEase Preview` (skip if those names already exist — use them).
3. **Import names from Vercel, not from git.** On a machine signed into Vercel:

   ```bash
   npx vercel env pull .env.production.local --environment production --yes
   ```

   In 1Password: open `KidEase Production` → **Import .env file** → choose `.env.production.local`. Then **delete** `.env.production.local`. Repeat for Preview → `KidEase Preview` (`--environment preview`).
4. **Fill gaps** for names that are in `.env.example` but not yet on Vercel (Inngest, Twilio, DocuSign, …). Paste from the vendor dashboard. Do not invent values.
5. **Conceal** API keys, tokens, PEMs, and connection strings. Leave feature flags, public URLs, and `price_` / `pk_` ids visible.
6. **Mount** a local `.env` (macOS / Linux, 1Password desktop running):

   Environment → **Connect to → Local .env file** → path = this repo’s `.env` (already gitignored).

   Do not mount over a git-tracked file. `.env` is ignored; `.env.example` stays in git.
7. **Copy the same names back to Vercel** if you added or rotated anything in 1Password. Dashboard → kidease-git → Settings → Environment Variables → Production and/or Preview → Redeploy.
8. **Confirm names only:**

   ```bash
   npm run ops:1password-checklist
   # After `op run` or a mount-backed shell, names present without printing values:
   npm run ops:1password-checklist -- --presence
   ```

9. **Leave CI secret-free.** GitHub Actions must not receive `OP_SERVICE_ACCOUNT_TOKEN` or Vercel production values for this foundation PR.

Cursor (macOS / Linux) with the 1Password plugin installed validates the mount via [`.1password/environments.toml`](../.1password/environments.toml) (`mount_paths = [".env"]`). Set `mount_paths = []` only if the hook blocks you mid-migration. Official hook notes: [agent-hook-validate](https://www.1password.dev/environments/agent-hook-validate.md).

## Local `.env` mount (Vite)

1Password mounts `.env` as a FIFO, not a plaintext file. Vite’s file watcher can restart in a loop if it treats FIFO open/close as a change. `vite.config.ts` ignores `.env` / `.env.local` / `.env.*.local` so `npm run dev` stays stable.

- Unlock 1Password before the first process reads `.env`.
- Do not keep `.env` open in an editor while `vite` or ops scripts read it (FIFO is not for concurrent readers).
- Offline you only get the last synced snapshot.

Docs: [local .env files](https://www.1password.dev/environments/local-env-file.md).

Optional later (not required for this foundation): 1Password CLI `op run --environment "KidEase Production" -- npm run ops:seed-catalog` so a one-shot script never writes secrets to disk. Environments CLI/SDK support is still evolving — desktop import + Vercel copy is enough.

## What this repo will not do

- Commit real secrets, PEMs, or `vercel env pull` output.
- Call 1Password APIs or require a service-account token in CI.
- Add a GitHub Action that loads production env (that is a later, explicit decision).
- Change runtime reads — the app still uses `process.env` / `import.meta.env` as today.

## Rotate

1. Rotate at the vendor (Neon, Stripe, Twilio, …).
2. Update the matching 1Password Environment variable.
3. Update Vercel **kidease-git** (same name, same target).
4. Redeploy. For `BETTER_AUTH_SECRET`, expect existing sessions to drop.

## References

- [1Password Environments overview](https://www.1password.dev/environments/overview.md)
- [Local .env mounts](https://www.1password.dev/environments/local-env-file.md)
- [Cursor plugin](https://www.1password.dev/environments/cursor-plugin.md)
- Inventory source (names only): `scripts/1password-env-inventory.mjs`
