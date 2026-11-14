# Tour scheduler activation: natural execution unverified

Kyle approved enabling only hourly tour alongside existing search, including overdue
holds and existing parent/centre notices plus gated in-app reminders, and accepted
up-to-one-hour expiry-notice timing. His rollout instruction on November 14 was:
"Do the rollout checks then merge and ship and turn on." Tracker schema approval
is separate and does not authorize tracker scheduling.

This activation source sets `TOUR_SCHEDULER_ACTIVATED = true`. With both existing
Inngest keys configured, the serving registry admits exactly `search-alerts-hourly`
and `tour-holds-hourly` in app `kidease`. With either key absent it serves search
only. Search's function ID, hourly :20 America/Winnipeg cron, event trigger and
`run-search-alert-job` step are unchanged. Tour retains its hourly :50 trigger,
event ID, `expire-tour-holds` step and concurrency limit of one. The other 15 job
definitions remain unregistered; tracker is not admitted by this registry.
Do not sync an older deployment that still serves all 17 definitions.

Source activation is not deployment, registration or proof of execution. The
coordinator must approve the exact tested activation head before merge/deployment,
then handle the existing Production app sync and natural-run observation. No keys,
channel flags, feature defaults, schema, cadence or customer records are changed by
this PR. Both keys still make the authenticated Vercel tour endpoint defer; absent
keys preserve its existing fallback. No manual event, forced route or dry-run may
be used to manufacture readiness evidence.

## Prepared behavior and boundaries

The worker uses the winner-only guarded expiry claim from #847: it rechecks
pending status and the deadline in `UPDATE ... RETURNING`. Only the winner owns
subsequent messages, conversation activity, linked lead status and notices.
Current page-read/book/list fallback calls remain in place. Their removal belongs
to #847 after natural scheduled execution is verified; Kyle has now accepted the
notice-delay change. Do not merge #847 or tracker #848 as part of readiness.

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

## Approved scope and coordinator rollout checks

Before merge/deployment, review the exact activation head and passing required
checks. Verify the production project/deployment target, existing app identity,
registered functions and any automatic deployment-sync integration. Preserve app
ID `kidease`, search IDs/triggers and signing-key environment. Verify presence of
both existing keys without exposing values. Review authorized read-only evidence
for first-sweep overdue backlog and current reminder/channel gates. No additional
job, feature, key or schema activation is within the tour rollout approval.

Deploy only the reviewed activation head. Verify the endpoint targets that current
deployment before syncing. If a hosting integration auto-syncs, deployment itself
is the activation boundary. The coordinator handles sync through the existing
authorized Production app, then confirms exactly search and tour with their
intended triggers. Never use a second URL with the same app ID as presumed
isolation. Stop if registry membership or the deployment identity differs.

Observe a naturally scheduled :50 run without clicking Run, Retry or Sync again.
Record app/function/deployment identity, provider run ID/permalink, schedule tick,
start/end timestamps and timezone, and the `expire-tour-holds` step result. Require
`dryRun:false`, `ok:true`, expiry `status:complete`, zero phase failures, and a
successful or explicitly flag-off reminder phase. Zero due holds is valid. Check
subsequent expected ticks and retained errors. Heartbeat, HTTP 200, registration,
manual/forced invocation, or overall run completion alone cannot clear this gate.
No positive expiry count or actual customer delivery is needed to prove execution.

Keep #847 unmerged until that natural-run evidence is recorded. Kyle has accepted
the up-to-one-hour notice timing, but unhealthy scheduling can delay persistence
and notices indefinitely. The existing read fallback stays in this activation PR.
Tracker #848 retains its independent schema, rollout and scheduling gates.

## Verification required for this activation head

- Actual registry and serve-route fixtures: configured keys yield exactly search
  and tour; either key absent yields search only; explicit tour opt-out restores
  search only. No unrelated job is admitted or executed during registration.
- Stable search app/function/triggers/step and forwarding behavior; unchanged tour
  trigger, step and concurrency. Existing key-presence ownership matrix remains.
- Cron fixtures: GET/POST bearer authorization before overrides, force/dry-run
  forwarding, no heartbeat on defer/dry-run/failure, sanitized failure responses.
- Worker/reminder fixtures: exact deadline and 48-hour fallback, duplicate and
  overlapping claims, acceptance/renewal races, phase failures, confirmed counts,
  reminder notice dedupe and retryable notice/mark failures.
- Alert fixtures: only tour recipients/channels considered; unrelated pending
  outbox rows untouched; existing skips, quiet hours, channel/QA rules and generic
  dispatch behavior preserved.
- Exact-head lint, typecheck, unit suite, credential-free production build,
  required CI/e2e and store checks. CI fixtures do not prove live scheduler health.
  No UI change is included.
