# Desk audit follow-up, 17 November 2026

This is a partial follow-up, not six-desk end-to-end sign-off. No production writes, merge or deployment.

## Changes

- Separate lightweight learning-stories, curriculum and organisation navigation links from the three desk implementations. Provider/staff shell lazily loads the selected panels rather than importing all three through their links. Permissions, feature-status checks, navigation and translated labels are preserved.
- Fix a setup-card placement race: onboarding previously checked the reserved provider slot once and, when the desk had not loaded, permanently inserted the card above the page. Provider cards now wait for the slot, follow a replacement slot, and detach when it disappears. Parent placement remains unchanged. The observer disconnects on cleanup.
- Simplify the Registries heading, overview and missing-link explanation in EN/FR. Keep the distinction between a saved catalogue comparison and a live registry check. Existing detailed adapter notes and status semantics are unchanged.

## Validation

- TypeScript: passed after installing the existing lockfile into the isolated worktree. No dependency version changes.
- Targeted ESLint: zero errors; three existing route fast-refresh warnings. The initially reported test escape warning was corrected and the affected test re-linted clean.
- Full unit suite: 3,525 passed, zero failed, two skipped (3,527 total). Browser-dependent tests reported no bundled Chromium.
- Local public browser smoke, shard 1/8: 34 checks passed, zero failed. Used installed Chrome via an otherwise identical temporary runner because the bundled Playwright executable was absent. DATABASE_URL was removed from the preview environment. This is public/gate coverage, not authenticated desk acceptance.
- Local baseline and candidate Vite builds: passed. These builds did not run deploy, database migrations or sourcemap uploads.
- No 390px/1280px authenticated setup-card screenshot or browser CLS result was collected. DOM-placement logic has delayed-slot, removal/reappearance and parent-placement regression tests.

## JavaScript artifact comparison

Baseline: release 18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3. Candidate includes draft #939 plus this follow-up. Same locked dependencies and machine.

Walked provider entry's static ES-module imports recursively using es-module-lexer, counted unique JavaScript files, and summed each file's raw length and Node gzip length. Dynamic imports and runtime-selected panels are excluded. This is NOT browser transferred bytes, a cold-load waterfall, a staff-specific measurement or CLS.

| Measure | Baseline | Candidate |
| --- | ---: | ---: |
| Static JS files | 133 | 129 |
| Raw bytes | 2,552,560 | 2,495,416 |
| Sum gzip bytes | 814,545 | 797,742 |

Static closure reduction: 16,803 gzip bytes, approximately 2.1%. Entry files: provider-B_O5VXfO.js and provider-FrcvJDtl.js. Further work is still warranted; the handoff's historical approximately 870 KB figure used an unspecified browser measurement and is not directly comparable.

## Remaining work

- Admin queue SSR: current page waits on client user, desk-session and 2FA gates. A safe loader/session-hydration design needs dedicated auth regression coverage; none of those guards were bypassed here.
- Parent home stage-aware ordering: older audit describes different searching/enrolled experiences, but the terse current handoff does not define the exact scope. Existing home props lack the enrolled-child updates and bills needed for that experience.
- Verify setup alignment visually at 390px and 1280px under authenticated fixtures, then measure browser JS and CLS on equivalent before/after fixtures.
- Registry overview is simplified; technical row-level adapter notes remain visible and unchanged.
- Existing government bundle cache, province scope, Requests navigation and calendar legend were not duplicated. Their existence in code is not fresh live acceptance.

The isolated dependency install reported 17 audit findings (11 moderate, three high, three critical). No upgrades or automatic audit fixes were applied.
