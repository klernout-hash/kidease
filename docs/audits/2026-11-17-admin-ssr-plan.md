# Admin queue counts: SSR investigation, 17 November 2026

Admin counts are **not server-rendered by this change**. No admin runtime file or authorization rule was changed. This note records the remaining implementation boundary so a loader that never paints is not mistaken for the completed audit item.

## Source evidence

- [`src/routes/admin.tsx`](../../src/routes/admin.tsx) runs `beforeLoadAdminDesk`, has no queue loader, and lazy-loads `AdminPage` inside `Suspense`.
- [`src/lib/server/admin-route.ts`](../../src/lib/server/admin-route.ts) calls `assertAdminDesk` with a six-second timeout. Signed-out, unauthorized and failed gates become a plain 404; missing 2FA redirects to `/verify-2fa`. The loopback role fixture explicitly does not open this desk.
- [`src/lib/auth/middleware.ts`](../../src/lib/auth/middleware.ts) rejects cross-site requests, resolves the verified user through `requireUserId`, and rejects government accounts on private APIs. [`verify.server.ts`](../../src/lib/auth/verify.server.ts) resolves the session from Better Auth, including persistent-session enforcement and the view-as boundary. A supplied user ID is not proof of a session.
- [`src/lib/server/roles.ts`](../../src/lib/server/roles.ts) has two different admin checks. `assertAdminDesk` checks `resolveAdminAccess`, verifies the 2FA cookie, and attempts idle bootstrap without throwing on a stale idle window. `requireAdmin` additionally checks trusted-device revocation and enforces idle freshness. Queue data uses the stronger check: `listAdminCentres` calls `requireOperator`, which calls `requireAdmin`.
- [`src/components/admin-desk-page.tsx`](../../src/components/admin-desk-page.tsx), `AdminPage`, waits for `useCurrentUserState`, then `useSessionDesks().ready`, then `canVisitDesk`, then `TwoFactorGate`, before rendering counts. `refresh` starts only in a client effect after user and desk readiness; `centresReady` starts false.
- [`src/components/session-desks.tsx`](../../src/components/session-desks.tsx) starts with a null session and `ready: false`; its effect calls `getMyDesks`. [`src/lib/auth/gates.tsx`](../../src/lib/auth/gates.tsx), `TwoFactorGate`, starts staff destinations in `load` and verifies them in an effect. Prefetching queue rows would leave these initial-render blockers intact.
- [`src/lib/server/role-route.ts`](../../src/lib/server/role-route.ts), `RoleChromePayload`, provides lightweight navigation context, not a 2FA, trusted-device, idle or full desk-readiness proof. It must not substitute for the gates above.
- Current queue totals depend on `staffQueueRows(withGhostClaimLab(centres), showQaFixtures)` and `tallyAdminCentreStats`. The incomplete and licence/photo counts also use the selected search/province/document filters. A new SQL count must preserve these semantics, especially the exclusion of QA fixtures. Open-lead counts are separate and are not centre rows.

## Required implementation

The blocker is the missing request-bound admin bootstrap and hydration lifecycle, not a missing product decision or permission to weaken authorization. Fixing only the route loader is insufficient; changing the shared gates ad hoc would exceed this small ordering patch.

1. Add one request-scoped server bootstrap behind the existing auth middleware. Resolve the actual session actor; run the complete `requireAdmin` chain; resolve the desk context and check `canVisitDesk` before reading or returning a queue summary. Keep `assertAdminDesk` and its 404/2FA routing behavior. Reuse verified results within the same request where possible, without caching an authorization result across users or requests.
2. Return a minimal serializable payload bound to the verified user/session: desk context, completed gate state, and the queue summary. Do not serialize session tokens, 2FA cookies, trusted-device secrets, parent data or the full centre list merely to obtain counts. Keep any server-only proof material on the server. A boolean supplied by the browser cannot authorize a data read.
3. Seed the initial admin render from that completed server result and reuse it during hydration. Reconcile it with the existing current-user, desk-ready and 2FA checks. Local sign-out, a different user/session, an explicit denial, verification failure or expiry must invalidate the bootstrap immediately; a stale route payload must never reopen the desk. Data endpoints must continue to run `requireAdmin` independently.
4. Use the current queue predicates for each count. Retain a distinct unavailable state and retry path for a failed queue read; do not convert authorization or database errors to zero or an empty queue. Keep the existing client refresh and filters after hydration.
5. Measure initial HTML, time to first count and layout shift using synthetic data before calling this an improvement. Bound failures and retain a usable recovery path. Do not hold the whole document indefinitely while unrelated money/contracts panels load.

## Required acceptance checks

Use local synthetic sessions, cookies, users and queue rows. No saved credentials or production reads are needed for this test suite.

- Render the actual `/admin` document before JavaScript: a fully verified operator has the expected counts in HTML. Hydration preserves them without a mismatch, duplicate summary or flash of a different account.
- Signed-out and non-admin requests return the existing 404 and serialize no queue totals or rows. Repeat with a forged loopback role fixture and an unauthorized promoted account.
- An admin with absent, expired, tampered or other-user 2FA proof redirects to verification and receives no serialized queue data. A revoked trusted device and stale idle window also receive no queue data. Failure of any proof must happen before the queue read.
- Cross-site requests, government accounts, persistent-session revocation and view-as requests keep the existing authorization boundary. Exercise both cookie sessions and the supported bearer path.
- Unresolved or failed desk readiness cannot render the private summary. During hydration, sign-out, account changes and an explicit failed 2FA refetch clear it. Revalidate when route data would otherwise outlive its gate proof.
- Real empty queues show zero; a queue-query timeout or failure shows unavailable with retry. Synthetic QA/Claim Lab rows, live/declined/waiting states, incomplete rows and selected filters match current count predicates.
- Inspect 390 px and 1280 px layouts and keyboard operation; capture screenshots and CLS after the real component can render from synthetic server authorization. A public fixture that skips gates is not evidence of admin SSR.

## Checks run in this investigation

`node --experimental-strip-types --test scripts/admin-desk-nav.test.mjs scripts/admin-idle-fresh.test.mjs scripts/admin-centres-load.test.mjs scripts/admin-stat-filter.test.mjs scripts/admin-decision-auth.test.mjs`

Result: 29 tests passed. These protect the existing redirects, idle handling, queue failure honesty, count predicates and decision gate. They do **not** prove a new SSR path, full authenticated browser behavior, or production data correctness.

`node --experimental-strip-types --test scripts/demand-report-read.test.mjs scripts/hardening.test.mjs scripts/parent-2fa-loop.test.mjs`

Result: 21 tests passed. The synthetic demand-reader suite invokes the actual `requireAdmin` authorization chain with mocked session, role and proof dependencies; unauthorized roles and failed 2FA, device and idle proofs cause rejection before the data query. This is evidence for preserving the stronger data boundary, not a test of a new queue-summary endpoint. No external payment service was called.

`npx prettier --check docs/audits/2026-11-17-admin-ssr-plan.md` and `git diff --check` also passed.

Authenticated admin browser checks remain outstanding. No login, production write, flag change, outbound message or Stripe action was attempted during this investigation.
