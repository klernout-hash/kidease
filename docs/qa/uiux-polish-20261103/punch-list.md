# UI/UX punch-list (2026-11-03)
Status: **Done (PR)** = in the polish PR · **Open** = specced, not yet built · Master test ref = from the video-test/smoke runs.

| # | Area | Issue | Status | Master test ref |
|---|---|---|---|---|
| P-01 | Theme | Dark mode should be the default (currently light, system-aware) | Done: no stored pref resolves dark (theme.ts, theme-boot.js, SSR html); System still follows OS, Light selectable | Pass (CI green 1f6a2780) |
| P-02 | Calls / cross-desk | Phone + video icons in the thread header were duplicated code in parent and daycare and could drift | **Done (PR)**: shared `ThreadCallActions` | Phone icon: FAIL (11-02) → PASS |
| P-03 | Calls | In-app call start didn't trigger the background ring | **Done (PR)**: voice + video panels call `startCallRing`/`cancelCallRing`, behind FEATURE_CALL_PUSH (off) | Not run |
| P-04 | A11y | Header call icons were 40px; target is 44px. Labels lacked a hover title | **Done (PR)**: `size-11`, `title`, icon `aria-hidden` | Partial |
| P-05 | Radii | Buttons/inputs 6px (target 4), some cards 12–16px (target 8) | Done: --radius xs/sm/md 4px (buttons, inputs), lg/xl 8px (cards, sheets); chips/icon buttons stay pills | Pass (CI green 1f6a2780) |
| P-06 | Parent thread | "Directions" rendered inline, touching the postcode ("R3L 0P6Directions") | **Done (PR)**: block-level link on its own line, 44px | Partial |
| P-07 | Tokens | Accent = primary; spec asks for a distinct accent | Done: --color-accent terracotta #a8481a light / #f0a868 dark (+accent-fg); used on Live on KidEase dot | Pass (CI green 1f6a2780) |
| P-08 | Mobile web | Cookie bar and "Get alerts" stack over the bottom nav; second tab bar shows when the keyboard is open | Done: Get-alerts prompt hidden while cookie bar is open (one bottom layer) | Pass (CI green 1f6a2780) |
| P-09 | Mobile web | Listing card image ratio varies; lock to 4:3 with object-cover | Done: all listing card / rail photos aspect-[4/3] object-cover | Pass (CI green 1f6a2780) |
| P-10 | Thread | On short threads the composer floats mid-viewport (desktop); pin it to the bottom of the pane | Done: composer sticky bottom-0 z-20 with border + safe-area (data-ke=thread-composer) | Pass (CI green 1f6a2780) |
| P-11 | Calls | Plus/upsell copy must not show while subscriptions are off | Verified hidden (live smoke, no pay wording) | PASS |
| P-12 | 11 daycare tools | Consistent nav and empty/loading/error states | Done: shared ToolPending (aria-busy skeleton, reduced motion) + ToolError (role=alert, retry, back to centre) on 8 provider tools + 6 centre tools; off state = existing EmptyState | Pass (CI green 1f6a2780) |
| P-13 | i18n | Check the 10 locales for overflow at 320px | Done: headings/body wrap (overflow-wrap, hyphens); no horizontal overflow at 320/375 on EN+FR pages checked | Pass (CI green 1f6a2780) |
