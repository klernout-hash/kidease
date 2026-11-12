# Huawei availability fallback and release handoff — 12 November 2026

Base: shipped main `7e7c65689dd76c7a33f8e2a1faab8f9ee256e63b` (PRs #842–#845). Follow-up branch: `cursor/huawei-availability-fallback-20261112`. This is a draft review change; no merge or production release is authorized by this document.

## Source correction

`APP_STORES` already records Huawei as `live: true, url: null`. The shared `AppStoreStatus` correctly shows availability without a link. `StoreBadges` still selected Coming soon from URL absence, contradicting the shared panel. Its status now reads `configured.live`; its download link still requires both availability and a verified URL. Existing English “Available now” and French “Offert maintenant” translations are reused. No AppGallery URL is supplied or inferred.

Authorization chronology was checked directly in Kyle's room history. His 15:44:41.911949 UTC handoff said Huawei stays Coming soon; his later 15:45:34.742714 UTC correction said “Huawei is live”. The later correction governs this availability-only change.

Classic remains the source default. Payment/subscription flags and configuration, native store routing, and paused Email/CRM bots are unchanged. Excluded PRs 357/336/307/289/841 are untouched. No credentials, secrets, spending, production health/on-call probes, authenticated desk loaders, or bot messages were used.

## Local verification

- Eight rendered-component regressions cover both actual TSX panels in English and French: Huawei available without an anchor; Google Play's verified link; pending Apple/Galaxy/Microsoft tiles; and an unavailable fixture retaining a URL without becoming clickable. Router translation context, the Amazon opener and the unrelated button wrapper are stubbed. The two Huawei badge cases failed on the shipped source, then all eight passed after the correction.
- Focused app-store/render/ignored-build checks: **12/12 passed**.
- Typecheck: passed. Lint: passed, **0 errors / 131 existing warnings**.
- Full repository tests in UTC: **2833/2833 passed**, zero skips. The first concurrent run had a dev-server startup timeout and a timezone-sensitive existing profile-age assertion; UTC isolation and a standalone rerun passed. No unrelated source was changed.
- Credential-free `npm run build`: passed with an empty inherited environment apart from PATH. `DATABASE_URL` was absent, database migration skipped, telemetry sourcemap upload skipped, and SSR/locale/client-database guards passed. A first concurrent build was killed; the standalone build passed.
- Preview safety was verified before building: `vercel.json` still selects `scripts/vercel-ignore.mjs`; this distinct `cursor/*` branch returns skip / exit 0 and is outside its four allowlisted exceptions. Final-head Vercel status must independently confirm the actual ignored build.
- Required local smoke was attempted with `npm run e2e:preview -- --shard 1/8` against the isolated loopback preview. The server booted; browser launch failed because pinned Chromium headless shell v1234 is unavailable. **Zero browser checks ran; this is blocked, not a smoke pass.** Full Chromium and headless-shell downloads returned truncated/invalid ZIPs; system Chromium failed at process-singleton socket creation with Operation not permitted.
- No 390px/1280px screenshots were captured. Planned EN/FR × classic/clean × light/dark × 390×844/1280×900 component-fixture captures remain blocked by those browser failures. Rendered output checks do not establish clipping, contrast, full-route appearance or live acceptance. See [capture status](../audits/evidence/huawei-availability-20261112/capture-status.json).

Local command logs are `/tmp/kidease-huawei-{typecheck,lint,tests-utc,build,e2e}.log` in this task environment. Tests/build ran against the final runtime edit; generated route ordering was restored and excluded from the PR. No production data was used.

## CI capture follow-up

The normal desktop visual test now runs a separate app-store availability regression on the isolated loopback preview. It captures the actual `/get-app` and `/fr/get-app` routes at 390×844 and 1280×900, in classic/clean and light/dark (16 full-page PNGs). It verifies both Huawei panels, pending-store and Google Play link behaviour, actual viewport/DPR/theme/look, and horizontal overflow. It never follows store links or opens a production route; off-origin requests are blocked. No Amazon URL override or runtime feature change is needed.

PNGs and `manifest.json` use the existing always-uploaded `artifacts/e2e/desktop-actual/app-store-availability/` directory in `desktop-visual-report`. No workflow, permission, secret or external service changes were made. The manifest records PR head separately from the CI checkout/merge SHA, source/image hashes and observed results. A capture/assertion exception blocks the desktop job and aggregate e2e; it does not inherit the desktop pixel comparison's nonblocking mismatch policy. Manual external-URL desktop runs skip this loopback-only regression.

The earlier local capture failures above remain historical. CI screenshots and final-head required checks are pending until their actual artifact is retrieved and reviewed; final provenance and links belong in the PR description.

## Release and acceptance boundaries

Required GitHub `check` and aggregate `e2e` must be read against the exact published follow-up head. Earlier PRs' passing checks do not transfer. Branch-protection inspection through the GitHub integration returned 403, Resource not accessible by integration; Kyle's named requirements remain authoritative. Record final-head results in the draft PR description.

The final **already shipped** commit is `7e7c65689dd76c7a33f8e2a1faab8f9ee256e63b`. The connector reported success for project **kidease-git**, [deployment GEPmMQxgyrxtm8sdTVuNjy4gtQyz](https://vercel.com/klernout-1129s-projects/kidease-git/GEPmMQxgyrxtm8sdTVuNjy4gtQyz). This is deployment metadata, not authenticated acceptance or a fresh direct domain/alias check.

The Mac outage left authenticated post-release acceptance and direct alias checks after #842 unverified. The prior release worker's anonymous `/fr/get-app` retrieval observed Huawei available in the shared panel but Coming soon in the separate badge; English freshness was uncertain. This follow-up is not shipped and does not claim a live fix.

The dated [audit reconciliation](../audits/2026-11-12-reconciliation.md) preserves all 74 baseline findings while identifying #842–#845 shipped implementations. P06 covers the saved map only; public G03 map/list parity remains separate. P09 expiry status/resend and P11 the actual Huawei direct URL/push delivery remain incomplete. Roughly 243 flags and `KIDEASE_CONNECT_LIVE=0` are historical values, not freshly verified runtime facts. Do not call production health or desk loaders to fill the evidence gap: those handlers can backfill ages, expire tour holds and send notices.

## Replacement Test Bot draft — for Kyle to copy and send

This replacement does not reproduce an unavailable original attachment. Kyle sends it; no bot is contacted by this work.

```text
KidEase release handoff — 12 November 2026

Shipped main: 7e7c65689dd76c7a33f8e2a1faab8f9ee256e63b, including PRs #842–#845.
Vercel project: kidease-git.
Deployment: GEPmMQxgyrxtm8sdTVuNjy4gtQyz; connector reported success for that exact shipped SHA.

Classic remains the default. Payment/subscription configuration was unchanged; Email Bot and CRM Bot remain paused. Roughly 243 enabled flags and KIDEASE_CONNECT_LIVE=0 are historical handoff values, not a fresh runtime audit. No change to payments or Connect is authorized here.

Shipped implementations: #842 government analytics scope (V01), #843 saved-centre map isolation (P06 only; G03 is separate), #844 attendance summary (P04), and #845 eight copy/layout items P09/P11/P12/P14/P21/P22/P24/X03. Shipped source and CI do not establish live acceptance, and all 74 findings are not resolved. P09 expiry status/resend and P11 the actual Huawei listing URL/push remain incomplete.

Prior live ledger, not a fresh post-release retest: D01/P01/D02 passed at 390px and 1280px; G05 passed at 1280px only, phone not checked. X05/P03/P05/V08/V06 remain untested. The Mac outage left authenticated acceptance and direct alias checks after #842 unverified.

Kyle later confirmed Huawei is live. Its direct AppGallery URL is unverified, so none was invented. A separate draft follow-up corrects the badge's stale Coming soon fallback in EN/FR; it is not merged or deployed. Local typecheck/lint, 2833 tests and credential-free build passed. Local browser smoke and screenshots are blocked; exact published-head required check/e2e and Vercel ignored-build results belong in that draft PR.

Do not run production health/on-call or authenticated desk loaders: these can backfill ages, expire holds and send notices. Do not send messages, pay, change flags, resume bots, merge or deploy from this handoff. Kyle retains release approval.
```
