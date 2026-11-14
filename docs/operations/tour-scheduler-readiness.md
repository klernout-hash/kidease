# Tour scheduler readiness: activation is disabled

This change prepares a bounded tour worker. It does not enable a live scheduler.
`src/inngest/registry.ts` keeps `TOUR_SCHEDULER_ACTIVATED = false`. The existing
`kidease` app serves only `search-alerts-hourly`. Its function ID, hourly :20
America/Winnipeg cron, event trigger and `run-search-alert-job` step are unchanged.
The other job definitions remain unregistered. Do not sync an older deployment
that still serves all 17 definitions.

The tour function can be served only after a reviewed code change enables that
constant **and** both existing Inngest keys are configured. There is no new runtime
feature flag. Keys alone never enable registration. The existing Vercel key-based
deferral remains unchanged: when both keys exist, `/api/tour-holds` still skips;
when either is absent, its existing authenticated fallback remains. This draft
does not claim that deferral proves registration or health. No keys, channel
flags, feature defaults, schema, cadence or production data are changed.

## Prepared behavior and boundaries

The worker uses the winner-only guarded expiry claim from #847: it rechecks
pending status and the deadline in `UPDATE ... RETURNING`. Only the winner owns
subsequent messages, conversation activity, linked lead status and notices.
Current page-read/book/list fallback calls remain in place. Their removal belongs
to #847 after natural scheduled execution is verified and the notice-delay change
is explicitly accepted. Do not merge #847 or tracker #848 as part of readiness.

Expiry and reminders report separate fixed-label phase outcomes and confirmed
counts. Scan/claim failures reject with sanitized phase evidence. Post-claim effect
or reminder failures return `ok:false`; the HTTP cron returns 503 and does not
heartbeat. An Inngest step can complete with an `ok:false` result, so overall run
completion alone is insufficient evidence. Dry-runs never heartbeat as live work.
A flag-off reminder phase is an explicit intentional skip, not a delivery claim.

Expiry still sends existing direct parent/owner tour mail and uses existing alert
channel, recipient, preference and QA rules. Tour alert dispatch handles only the
newly requested tour alert and never drains unrelated rows from the shared outbox.
Quiet-hours holds remain queued for the existing dispatcher; this change does not
activate or redesign that dispatcher. The due reminder phase remains gated by
`FEATURE_TOUR_CALENDAR` and creates parent in-app notices only.

Claims commit before later effects. A crash or uncertain acknowledgement can
leave missing messages or deliveries; direct email has no durable recipient claim.
A retry skips a tour already claimed and cannot repair those post-claim gaps.
The Inngest concurrency limit of one only covers this Inngest function, not Vercel,
page fallback or other processes. These limits are not exactly-once delivery or
multi-connection seat-allocation guarantees. Resolving them requires a separately
reviewed transactional/outbox design; no migration is included here. Do not replay
historical expired tours to compensate for uncertain delivery.

## Separate activation approval and procedure

Before asking to activate, review the exact production source, existing app's
registered functions and any automatic deployment-sync integration. Keep app ID
`kidease`, search IDs/triggers and signing-key environment unchanged. Verify the
presence of both required keys without exposing values. Inspect retained,
authorized read-only evidence for first-sweep overdue backlog and current reminder
and channel gates. Do not run a job, force route, dry-run, or send an event to
manufacture readiness evidence. Several unrelated repository jobs are not
side-effect-free in dry-run, and they remain outside this registration list.

Suggested explicit approval, with the exact activation head supplied:

> I approve enabling only `tour-holds-hourly` alongside the existing
> `search-alerts-hourly` in the existing KidEase Production app `kidease`, deploying
> activation commit `<SHA>` and syncing its verified current endpoint. I approve
> its natural hourly :50 America/Winnipeg expiry sweep, including existing overdue
> holds, parent/centre tour notices and reminders under their current gates. Keep
> the other 15 function definitions unregistered and preserve search behavior.
> Do not run manual events, forced jobs or change keys, feature flags or schema.

After that separate approval, prepare a separate reviewed activation change, including explicit
expected-registration test assertions, and rerun exact-head checks. Both keys are a registration prerequisite; they are not proof of
execution. Deploy the reviewed head and verify that the endpoint targets that
current deployment before syncing. If a hosting integration auto-syncs, deployment
itself is the activation boundary and must be included in the approval. Confirm
that the Production app then lists exactly search and tour with the intended
triggers. Never use a second URL with the same app ID as presumed isolation.

Observe a naturally scheduled :50 run without clicking Run, Retry or Sync again.
Record app/function/deployment identity, provider run ID/permalink, schedule tick,
start/end timestamps and timezone, and the `expire-tour-holds` step result. Require
`dryRun:false`, `ok:true`, expiry `status:complete`, zero phase failures, and a
successful or explicitly flag-off reminder phase. Zero due holds is valid. Check
subsequent expected ticks and retained errors. Heartbeat, HTTP 200, registration,
manual/forced invocation, or overall run completion alone cannot clear this gate.
No positive expiry count or actual customer delivery is needed to prove execution.

Only then may #847 remove read-triggered expiry, after a separate acceptance:

> I accept that expiry notices can arrive up to one hour later under the verified
> hourly tour worker. I authorize the separately reviewed #847 merge/deployment
> after its exact-head checks and recorded natural scheduled-run evidence pass.

## Verification required for this draft and any activation head

- Registry fixtures: default search only; deliberate tour opt-in plus configured
  keys yields exactly search and tour; other jobs remain unserved. Stable search
  app/function/triggers/step and forwarding behavior.
- Cron fixtures: GET/POST bearer authorization before overrides, key-presence
  ownership matrix, force/dry-run forwarding, no heartbeat on defer/dry-run/failure,
  sanitized failure responses.
- Safe worker/reminder fixtures: exact deadline and 48-hour fallback, duplicate and
  overlapping claims, acceptance/renewal between scan and claim, all phase failures,
  confirmed counts, reminder notice dedupe and retryable notice/mark failures.
- Alert fixtures: only tour recipients/channels are considered; unrelated pending
  outbox rows are untouched; existing skips, quiet hours, channel/QA rules and
  generic dispatch behavior are preserved.
- Final-head typecheck, lint, unit suite, production build with no application
  credentials, required CI/e2e and store checks. Browser evidence is local CI
  fixture evidence, not production acceptance. No UI change is included.
