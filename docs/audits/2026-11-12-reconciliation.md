# KidEase audit reconciliation — 12 November 2026

Historical audit baseline: `75cf0cd3cc1dc993b6eb920fe17139306f00cb80` (PR #840). Read AGENTS.md and docs/clean-look/README.md first. The dated reconciliation below supersedes the baseline status for shipped implementations. Source changes and local regression evidence are separate from live acceptance.

Primary source: current Library-read `KidEase-Five-Desk-Audit-2026-11-12.pdf`, Library ID `libfile_fde3_f-70705804f0808191a45b3151bd5b2ddb_89b906bfbf4081918e5900b0310185fb`, version 1, 39 pages, 74 actionable findings plus X02 passed retest. Full extracted text is in `audit-five-desk-text.txt`. No source item was invented.

## Current-status reconciliation — 12 November 2026, after PR #845

The original source audit below remains evidence of the `75cf0cd` baseline. Its “Still broken (source)” entries are historical observations, not assertions that those faults remain in current main. GitHub confirms PRs [842](https://github.com/klernout-hash/kidease/pull/842), [843](https://github.com/klernout-hash/kidease/pull/843), [844](https://github.com/klernout-hash/kidease/pull/844), and [845](https://github.com/klernout-hash/kidease/pull/845) are merged. Current shipped source is [`7e7c65689dd76c7a33f8e2a1faab8f9ee256e63b`](https://github.com/klernout-hash/kidease/commit/7e7c65689dd76c7a33f8e2a1faab8f9ee256e63b).

| Finding | Implementation shipped | Current acceptance boundary |
| --- | --- | --- |
| V01 | #842, merge `846e7be4f3d82da8b25402e6e0e4dc54d19e0f67`: city/region directory, cited fees, trends and vacancy updates use the selected public-listing cohort; wider demand/job context is labelled. [Scope and local evidence](../gov-analytics-scope.md). | Authenticated live analytics acceptance remains not checked. Government sign-in redirects at 390px/1280px do not establish analytics correctness. |
| P06 | #843, merge `a75d14e4b911fc4eaea47789680e465b1236b527`: saved-centre maps draw only the supplied shortlist and skip directory viewport fetches. [Scope and local evidence](../saved-map.md). | This addresses the saved map only. Public G03 search map/list parity remains separate and unresolved by this change; post-release saved-map acceptance remains not checked. |
| P04 | #844, merge `dd9986e31da97cf0053f1127eb81eb950d4c2d64`: one centre-confirmed attendance summary uses the centre-local date; dated parent absence reports remain separate. [Scope and local evidence](../parent-attendance-summary.md). | Parent/provider live reload acceptance remains not checked. Dual-role attribution is conservatively unlabelled. |
| P09 | #845: invitation wording consistently states a seven-day lifetime in English/French. | Wording correction shipped; expiry date/status and a resend control remain unimplemented. No invitation was sent during verification. |
| P11 | #845: shared store availability separates Kyle-confirmed Huawei availability from a verified download URL; general all-phone-apps-coming-soon alert claims are removed. | Kyle's later “Huawei is live” correction governs availability. The actual AppGallery listing URL remains unverified and absent; no direct link, device redirect or push delivery is established. The shipped badge fallback still derives its unavailable text from missing URL and requires the accompanying follow-up correction. |
| P12 | #845: Parent Documents owns the title/introduction; its vault panel hides the repeated heading. | Local enabled/disabled-vault coverage exists; current live Documents acceptance remains not checked. |
| P14 | #845: alert copy describes the parent's task; loading, failure/retry and loaded-empty states are distinct. | Local delayed/failing/retry fixtures exist; live alert acceptance remains not checked. |
| P21 | #845: deletion action/confirmation describe scheduled deletion and the 30-day recovery period. | Existing retention/revocation behaviour remains; no deletion was submitted and live acceptance remains not checked. |
| P22 | #845: password-reset and forgotten-sign-in-email guidance are separate in English/French. | Local entry-point checks exist; live recovery acceptance remains not checked. |
| P24 | #845: calendar days have full-date/visit-count accessible names plus selected/today states. | Local keyboard/date/locale fixtures exist; live calendar acceptance remains not checked. |
| X03 | #845: active-shift empty text is distinct from weekly no-hours text. | Local active/completed/empty-week fixtures exist; live staff-hours acceptance remains not checked. |

The eight #845 items and their local fixture evidence are documented in [the wording/layout scope](../qa/audit-copy-20261112.md). The released #842–#845 heads passed required GitHub `check` and `e2e` before merge, as recorded in their PR release evidence; those results do not transfer to a later follow-up head. This reconciliation does **not** mark all 74 findings resolved.

Vercel's connector reported successful completion for the exact final shipped SHA above at [kidease-git deployment GEPmMQxgyrxtm8sdTVuNjy4gtQyz](https://vercel.com/klernout-1129s-projects/kidease-git/GEPmMQxgyrxtm8sdTVuNjy4gtQyz). The Mac/browser outage prevented fresh direct alias/domain checks and authenticated post-release acceptance after #842. The release worker's anonymous French `/fr/get-app` retrieval showed Available in the shared panel but Coming soon in a separate badge panel; its English retrieval had uncertain freshness. These observations are limited evidence, not full app-page acceptance.

### Live ledger carried forward from the earlier handoff

The observations in [the original handoff](2026-11-12-handoff.md) were made against `75cf0cd` at 390×844 and 1280×900, with clean look selected. They are preserved below, not freshly retested against `7e7c656`.

| Finding | 390px | 1280px | Boundary |
| --- | --- | --- | --- |
| D01 Families route | Pass | Pass | Earlier handoff observed Families at your centre and the centre chooser. |
| P01 parent placeholder stack | Pass | Pass | Earlier handoff observed useful Home content without the old pre-header placeholder stack. |
| D02 daycare placeholder stack | Pass | Pass | Earlier handoff observed Today without the old pre-header placeholder stack. |
| G05 Toronto within 10 km | Not checked | Pass | Desktop parser response observed; the phone guided-matcher path was not established. |
| X05, P03, P05, V08, V06 | Not checked | Not checked | Existing QA threads/tours and government sign-in or product decisions remain needed. No new live acceptance is claimed. |

Classic remains the source default. Payment/subscription flags and configuration, paused Email/CRM bots, and excluded PRs 357/336/307/289/841 are unchanged. Roughly 243 flags and `KIDEASE_CONNECT_LIVE=0` are historical handoff values, not freshly verified runtime state. Production database health is not checked: health/on-call handlers can backfill ages, and authenticated desk loaders can expire tour holds/send notices. Do not invoke those loaders to update this evidence ledger.

## Historical baseline status meaning

- **Fixed:** acceptance observed on the live site. This read-only subtask makes no new fixed-live claims; the main agent's live matrix is authoritative.
- **Still broken (source):** the reported fault or contradictory copy is directly present at this baseline. Live acceptance remains untested by this subtask.
- **Not checked:** a merged implementation may exist, a live/account/data test is required, or this audit did not establish the current fault. A historic PDF is not evidence of current failure.

## Historical baseline: what the four earlier merged PRs changed

| PR | Confirmed merged source scope | What it does not establish |
|---|---|---|
| [831](https://github.com/klernout-hash/kidease/pull/831) | Five government pages; shared EN/FR header/navigation; truthful unavailable counts/licence dates; government province and cross-role guards; small-group suppression | Later V01 analytics cohort consistency, V06 dataset exports, or V08 search acceptance |
| [834](https://github.com/klernout-hash/kidease/pull/834) | Signed-out private-route guards; single sign-in menu card; phone listing CTA/heart; 44px source/fee tap areas; guest bell hidden; 404 title/menu; Winnipeg route; duplicate phone search count removed | Later G01 fee policy, G03 map cohort, G05 matcher, or all older U IDs. Its description leaves Claim placement and pricing/plans redirects unchanged |
| [836](https://github.com/klernout-hash/kidease/pull/836) | Government public-data/source truth labels; agreement-dependent data blank; oversight off by default; no invented child-per-space data | V01 cohort correctness or V03 duplicate maps/ratio presentation |
| [838](https://github.com/klernout-hash/kidease/pull/838) | Parent menu/frame consistency; child health inside Children; mobile destinations; listing CTA; duplicate Menu bell/help/headings reduced; saved/waiting content above search | P04 attendance truth, P06 saved map, or the later copy findings. Author explicitly did not browser-test signed-in parent desk |

Local existing regressions: `parent-desk-audit`, `gov-desk-simple`, `gov-oversight`, `support-case-route`, `role-access`, `request-guard`, and `explore-search` passed **42/42**. Log: `reconciliation-tests.log`. This does not prove live functionality.

## Historical primary Five-Desk findings at `75cf0cd`

| ID | Priority | Status | Baseline evidence or next acceptance |
|---|---|---|---|
| P01 | P1 | Not checked — implementation in #840 | Placeholder desk calls removed from parent route; main agent must record live first-screen results |
| P02 | P1 | Still broken (source) | `copy-en.ts` walletNotSetUp says payments not set up while centre-bill copy says Checkout live; capability-state acceptance also needs Stripe answer |
| P03 | P1 | Not checked — implementation in #840 | Quick reply templates/draft behavior added; select template and verify editable unsent draft live |
| P04 | P1 | Still broken (source) | `parent-desk.tsx:531` renders DailyCareDesk and ChildCheckHistory; attendance vs child_check_events sources diverge, browser date vs centre date also differ |
| P05 | P1 | Not checked — implementation in #840 | Tour body now state-driven; completed and other states need live retest |
| P06 | P1 | Still broken (source) | `MapView` still fetches viewport listings for saved-map caller; itemsOnly requested change not on baseline |
| P07 | P2 | Still broken (source) | `portfolio-gaps.tsx:45` renders raw portfolioFocusPath in sr-only text, exposing route/ID to assistive tech |
| P08 | P2 | Still broken (source) | `child-profile-form.tsx:61` scrolls target but never focuses it |
| P09 | P2 | Still broken (source) | `custody-copy.ts:45,47`: open-until-accepted and seven-day-expiry conflict in EN/FR |
| P10 | P2 | Still broken (source) | Parent daily-care copy still exposes staff timesheet/payroll/full accounting restrictions (`daily-care.ts:28`, `copy-en.ts:2044`); account preference role test remains needed |
| P11 | P2 | Still broken (source) | `alert-push.ts:445` and alert copy say all phone apps coming soon; APP_STORES has live Play/Amazon and Kyle says Huawei live, pending verified URL |
| P12 | P2 | Still broken (source) | `parent.tsx:211-212` repeats title/lead from `family-vault.tsx:142-143` |
| P13 | P2 | Still broken (source) | `family-vault.tsx:218` maps all centres into share selector without excluding active shares |
| P14 | P2 | Still broken (source) | `copy-en.ts:1253` / French counterpart expose matcher internals; verify fetch/loading and error handling as part of fix |
| P15 | P2 | Not checked | Shared stored topic/channel settings and entry-point consistency need controlled account retest |
| P16 | P2 | Not checked — partial #838 | Menu's second bell removed; live badge count semantics still need observation |
| P17 | P2 | Still broken (source) | `desk-nav.ts` parent groups still expose many overlapping primary destinations; #838 unified access but did not implement proposed five-item structure |
| P18 | P2 | Not checked — partial #838 | Saved/waiting content above search; enrolled mobile one-tap care path not proved |
| P19 | P2 | Still broken (source) | `copy-en.ts:2016` retains comma-separated medication-times label; structured schedule acceptance remains |
| P20 | P2 | Still broken (source) | `daily-care-desk.tsx:448` renders check-in/check-out and status alternatives together; next-valid-action acceptance pending |
| P21 | P2 | Still broken (source) | `copy-en.ts:1802` / FR: Delete everything despite scheduled recovery flow |
| P22 | P2 | Still broken (source) | `copy-en.ts:3371` / FR says Forgot password recovers email address |
| P23 | P3 | Not checked — partial #838 | Account desk heading changes landed, but repeated subheadings/irrelevant file input require keyboard/layout retest |
| P24 | P3 | Still broken (source) | `tour-calendar-page.tsx:176` day buttons render numeric day without full date/state/count accessible name |
| P25 | P3 | Still broken (source) | `child-health-log.tsx:44`, daily-care and phase copy retain internal/negative text |
| P26 | P3 | Still broken (source) | `parent-home.tsx` continues saved/search/waitlist/ECE-jobs home rather than enrolled-child Today |
| P27 | P3 | Not checked | Separate shortlist/family permission previews require product/UI acceptance; no invitation sent |
| P28 | P3 | Not checked | Public contact provenance not independently verified; no call or outreach attempted |
| D01 | P1 | Not checked — implementation in #840 | Main agent has live Families navigation evidence; use that matrix, including widths |
| D02 | P1 | Not checked — implementation in #840 | Provider placeholder cards removed or actionsOnly; verify first-screen live |
| D03 | P1 | Not checked — waiting on Kyle | Court-order yes/no answer blank; do not change policy |
| D04 | P2 | Not checked | CAD amount/period save→reload→public/bill consistency not exercised |
| D05 | P2 | Not checked | Existing-family linking needs designated QA path and both-desk acceptance |
| D06 | P2 | Not checked | Stored/published opening states need same-centre/date comparison |
| D07 | P2 | Not checked — waiting on Stripe choice | Integration readiness/QuickBooks state not verified; do not change flags/settings |
| D08 | P2 | Not checked | Calendar tour-count→exact-date tour-list behavior not exercised |
| D09 | P2 | Not checked | Manitoba framework agreement across Learning/stories/observations not exercised |
| D10 | P2 | Not checked | Mobile meal editor layout and every labelled control need 390px test |
| D11 | P2 | Still broken (source) | `copy-en.ts:3108` says private team review; `trustAttestLead` and `successAttestBody` say no certificate review |
| D12 | P2 | Still broken (source) | Raw status/config language remains in UI paths; broad replacement needs workflow-specific mapping, not changing stored enums |
| D13 | P2 | Still broken (source) | `host-listing-desk.tsx:393` still labels preview published listing; draft behavior not proved |
| D14 | P2 | Not checked | Inbox closed/archived/request action capability needs QA conversations |
| D15 | P2 | Not checked | Staff identity/permissions test would require designated recipients; none invited |
| D16 | P2 | Not checked | Empty-recipient action enabled states not exercised; no sends |
| D17 | P2 | Not checked | Structured monetary/default inputs not exercised |
| D18 | P2 | Not checked | Native offline and Tap to Pay not proved; no financial action attempted |
| G01 | P1 | Not checked — waiting on Kyle | Unconfirmed-fees hide/label answer blank; do not choose policy |
| G02 | P2 | Still broken (source) | `bookTour` copy remains Book a tour and live listing CTA uses it; inventory vs request wording requires context-aware change |
| G03 | P1 | Still broken (source) | Shared map still uses unfiltered viewport data; shortlist fix alone does not prove public search map/list parity |
| G04 | P2 | Not checked | All listings reset behavior needs URL/filter/result acceptance |
| G05 | P1 | Not checked — implementation in #840 | Parser fix added; live Toronto within 10 km path needs full guided flow |
| G06 | P2 | Not checked | Canonical facility identity and broken-image fallback require current catalog/live checks; no merges run |
| G07 | P2 | Not checked | Grouped filters/stale commute state need live UI investigation |
| G08 | P2 | Still broken (source) | `need-care-fast-copy.ts:28` says KidEase does not use Google Maps globally; must describe actual per-feature map |
| G09 | P2 | Still broken (source) | `mobile-search-sheet.tsx:578,590` uses generic fewer/more labels; school-age copy still 5–12 while other controls differ |
| G10 | P3 | Not checked — partial #834/#838 | Sticky CTA simplified, but full listing/sign-up journey acceptance remains |
| V01 | P1 | Still broken (source) | `gov-portal.ts:37` gets province bundle; `aggregate.ts:250` filters city facts but leaves fees/trends/waitlist/jobs provincial |
| V02 | P2 | Still broken (source) | `aggregate.ts:266,365` city rows carry/suppress numeric openSpots; no separate reporting status when reporters absent |
| V03 | P2 | Still broken (source) | `gov-dashboard.tsx:333,363` renders two GovMap components in Overview; ratio source/scope requires separate retest |
| V04 | P2 | Still broken (source) | Five unavailable report tabs and technical capability prose remain; #831/#836 improved honesty, not full prioritization/collapse |
| V05 | P2 | Still broken (source) | Overview shortcuts at `gov-dashboard.tsx:328` use bare gov URLs while primary GovFrame links preserve geography |
| V06 | P1 | Not checked — relabel implemented #840 / answer pending | Directory-summary label changed; real export build/leave answer blank; verify content/label live, do not build report exports yet |
| V07 | P2 | Not checked | Canonical city normalization code exists, but source vintage and trend metric presentation need current data retest |
| V08 | P1 | Not checked — town feedback implemented #840 | GovFrame provides town matches/no-match; centre/licence promises still broader than implementation and need acceptance |
| A01 | P1 | Not checked — needs Kyle sign-in | Observe session/network after Kyle enters credentials; never enter them |
| X01 | P1 | Not checked — needs Kyle sign-in | Admin/Gov/desk navigation session transitions not traced |
| X02 | PASS | Not checked this run — historic passed retest | Preserve time-card 22:42→23:42=1h and reversed-time rejection; report PDF's historic evidence separately |
| X03 | P2 | Still broken (source) | `staff-timesheet-desk.tsx:171,229` uses same weekly noRows copy for empty active shifts and empty totals |
| X04 | P2 | Not checked — planned/held | Delivery unproved; no send or flag activation authorized here |
| X05 | P1 | Not checked — schema fix implemented #840 | Cross-desk saved immunization→approve→reload acceptance needed using existing synthetic QA only |
| X06 | P2 | Not checked | Shared request hidden start/schedule defaults require trace/review; do not submit new real child data |
| X07 | P2 | Still broken (source) | `parent-desk.tsx:184,940` one shareConsent boolean drives every child card |
| X08 | P2 | Not checked | Current inbox preview/stage/archive parity needs QA workflow retest |
| X09 | P2 | Still broken (source) | `child-profile.ts:69,103` defaults sunscreenOk true; explicit-permission choice still requires scoped product decision |
| X10 | P2 | Not checked | Prior sharing worked historically; current weekday/meal/observation labels need render and controlled QA retest |

## Older PDF IDs and support A5

Authoritative definitions of **U1–U6 / P1–P6 / G1–G9** remain unlocated. They must not be equated to the newer zero-padded primary-PDF IDs. See `legacy-audit-mapping.md` for searched scope and limitations.

A5 support routing is already implemented in source by **PR #830**, commit `32cf570` / merge `4ac0718`, before these four PRs. English `support_.$caseId` is a root sibling; French is under FrRoute, not the inbox. Therefore no Outlet is needed in support.tsx. Local support route regression passes; live case acceptance is not checked.

## Historical proposed wording/layout batch — superseded by #845

P09 invitation lifetime, P12 document heading duplication, P14 alert empty-state language/loading, P21 deletion action name, P22 password/email recovery guidance, P24 full accessible calendar dates, and X03 active-shift empty copy.

Keep D03 court-order policy unchanged. Skip P11 until Huawei's real AppGallery URL is verified. This seven-item scope meets Kyle's requested 6–10 findings per PR.

## Historical outstanding evidence — see current reconciliation above

Original legacy PDFs, current Test Bot draft, Kyle government/admin session, safe preview/database isolation or verified ignored-build path, current runtime flag count, live database health via a genuinely read-only path, and current deployment alias evidence remain owned by the main handoff agent. Do not claim these from historical counts.

