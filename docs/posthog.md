# PostHog (product analytics + web session replay)

KidEase already sends page views, autocapture, and feature-flag evaluation through `posthog-js`. This page is how Kyle watches **session replay** on the website without recording parent or child PII in the clear.

The app **boots if `VITE_PUBLIC_POSTHOG_KEY` is missing**. Local/CI without the key is a no-op.

Capacitor (iOS / Android WebView) does **not** record sessions unless you set `VITE_PUBLIC_POSTHOG_REPLAY_NATIVE=1`. Leave that off.

## Watch a replay

1. Open [Session replay](https://us.posthog.com/project/594559/replay/home) in the KidEase PostHog project.
2. Filter by date, page URL (`kidease.ca` / `www.kidease.ca`), or a person (Better Auth user id — we never send email).
3. Click a row. Playback shows layout and clicks. **On-screen text and every form field are masked** (`*` + `maskAllInputs`). Passwords stay masked even if someone later loosens text masking.
4. Use the activity panel for events. Network bodies and headers are stripped — you will not see child-profile JSON or auth tokens.
5. You can also open a recording from an insight data point (**Watch recording**) — see [How to watch recordings](https://posthog.com/docs/session-replay/how-to-watch-recordings).

If the list is empty after a production deploy:

1. Confirm [Replay settings](https://us.posthog.com/project/594559/replay/settings) has **Record user sessions** on. The SDK cannot record if the project toggle is off.
2. Confirm Vercel **kidease-git** has `VITE_PUBLIC_POSTHOG_KEY` (same public `phc_…` already used for analytics) and `POSTHOG_HOST=https://us.i.posthog.com`. Redeploy after changing env. Do **not** invent a key or put a personal API key in the app.
3. Confirm [session-replay-web](https://us.posthog.com/project/594559/feature_flags/870864) is **enabled**. Turning that flag **off** stops recordings without a redeploy. Deleting it does **not** stop them (sampled replay stays on).
4. Remember the default sample rate is **20%**. Most visits will not produce a recording. Raise `VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE` (see below) if you need more, then redeploy.

## Privacy (childcare marketplace)

Recordings are for product UX, not for reading medical notes or family messages.

| Control | What it does |
| --- | --- |
| `maskAllInputs` + password / email / tel | Every input is blobs. Passwords cannot leak. |
| `maskTextSelector: "*"` | All on-screen text is masked, including names on cards. |
| `ph-no-capture` | Auth forms, child profile editor, child care cards, parent-desk child rows, provider child packets, and inbox message bodies are omitted from the recording DOM. |
| No network bodies / headers / canvas | API payloads and iframes are not recorded. |
| Event property scrub | Keys that look like email, phone, child name, allergy, medical, birthdate are dropped. |
| Identify | Better Auth user id only. No email, no name. `dev-user` is skipped. |

The **website** shows an Essential vs Allow analytics banner. Until the visitor taps **Allow analytics**, `posthog-js` is not loaded (no pageviews, no replay). **Essential** stores `denied` and keeps required cookies only. The choice is saved in `localStorage` as `kidease-analytics-consent` (`granted` / `denied`). The Capacitor app does **not** show this banner. Denied calls `applyPostHogRecordingGate()` and opts out of capture.

## Vercel env (kidease-git)

Public-by-design values only. Never commit real keys. Never prefix a personal API key with `VITE_`.

| Name | Required | Notes |
| --- | --- | --- |
| `VITE_PUBLIC_POSTHOG_KEY` | yes, to record | Same public project key already on Production. Leave unset locally to disable all PostHog. |
| `POSTHOG_HOST` | no | Defaults to `https://us.i.posthog.com`. Inlined at build (`envPrefix`). |
| `VITE_PUBLIC_POSTHOG_HOST` | no | Client override if `POSTHOG_HOST` was not inlined. |
| `VITE_PUBLIC_POSTHOG_REPLAY` | no | Unset = **on** (web). `0` / `false` stops recordings and keeps pageviews. |
| `VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE` | no | `0`–`1` (or `0`–`100`). Default **0.2**. |
| `VITE_PUBLIC_POSTHOG_REPLAY_NATIVE` | no | Unset / `0` = Capacitor off. Do not turn on without a native privacy pass. |
| `POSTHOG_FLAGS_KEY` | no | Server `FEATURE_*` overlay only. See `docs/flags.md`. Not required for replay. |

## Cost

Default **20%** of web sessions, after the project toggle and `session-replay-web`. Short bounces still count if they are sampled. To spend less: lower the sample, or turn the flag off. To watch more of a launch week: set `VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE=1` on Preview only, then put Production back to `0.2`.

You can also add URL / event trigger groups in [Replay settings](https://us.posthog.com/project/594559/replay/settings) later. Do not record `/login`, `/reset-password`, or child-profile routes at 100% without keeping the masks above.

## What is wired

- `src/lib/posthog.ts` — init, sample rate, consent gate, native gate, masking.
- `src/components/posthog-boot.tsx` — once in the root shell.
- CSP allowlist: `us.i.posthog.com` + `us-assets.i.posthog.com` (no `*.posthog.com`).
- Client flag helper `isPostHogFlagEnabled`. Server SMS / push / video gates stay on `docs/flags.md`.
