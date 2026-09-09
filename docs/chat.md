# Chat lab (scaffold)

Admin → Chat lab (`/admin-chat`) is a **flag checklist**, not a chat product.

Parent ↔ centre messages stay on `/inbox` (text only; poll/reload). Do **not** buy Stream or Sendbird. Do **not** treat `FEATURE_INAPP_CHAT=1` as working delivery.

## What staff see

- **Coming soon / feature flag off** on Chat, Push, and Video when those flags are off (the default).
- A **disabled composer**. Send is off. The form does not store, deliver, or fake a thread — even if `FEATURE_INAPP_CHAT` is on.
- Exact **flag names** (`FEATURE_INAPP_CHAT`, `FEATURE_PUSH`, `FEATURE_SMS`, `FEATURE_VIDEO`, `FEATURE_PROVIDER_SUBSCRIPTIONS`) plus docs paths. Secret values are never shown.
- Next-build checklists for **FCM / APNs** and **Twilio Video**, plus an SMS (Programmable SMS, not Verify) status. These do not enable live send, mint a charged call, or invent credentials.
- Production vs Preview: flags stay off on Production unless vendor secrets exist. Preview may override. See `docs/flags.md`.

## Flag names (defaults)

| Name | Default | Docs |
| --- | --- | --- |
| `FEATURE_INAPP_CHAT` | **off** | this page |
| `FEATURE_PUSH` | **off** | `docs/push.md` |
| `FEATURE_SMS` | **off** | `docs/sms.md` |
| `FEATURE_VIDEO` | **off** | `docs/video.md` |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | **on** | `docs/flags.md` |

Flip remote overlays in PostHog with the **same key** — see `docs/flags.md`. Env is the fallback.

This PR does **not** turn `FEATURE_PUSH` or `FEATURE_VIDEO` on.

## Guest Live Chat helper

The floating **Live Chat** helper on marketing pages (`HelpBot`) is gated on `FEATURE_INAPP_CHAT`. When the flag is off (the default), the bubble and “Ask a question” composer are not mounted, so guests are not invited to send. `askKidEase` also refuses when the flag is off. Parent ↔ centre threads stay on `/inbox`.

## Composer

`src/lib/chat-scaffold.ts` owns the stub types and `chatComposerState()`.

- `CHAT_SCAFFOLD_READY` stays `false`.
- `sendScaffoldChatMessage` / `refuseScaffoldChatSend` always return `{ ok: false }`.
- Suggested later tables (`chat_threads`, `chat_thread_members`, `chat_messages`) are **not** applied.

## Push + video (next build only)

- Push dry-run on this page **counts tokens**. It does not call FCM or APNs.
- `/video/lab` shows coming soon when `FEATURE_VIDEO` is off, or an honest credentials-missing state. The Twilio Video JS SDK is not attached. Plus is not charged from this lab.

## Later (not this PR)

- First-party extra kinds (parent/admin) with real persistence.
- Vacancy push fan-out after `FEATURE_PUSH=1` + a native binary + a dry-run.
- `@twilio/video` on `/video/$roomId` after `FEATURE_VIDEO=1` + API key + CSP hosts.
