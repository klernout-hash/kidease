# KidEase design system (v1, 2026-11-03)
Source of truth: `src/styles.css` (tokens) + `src/components/ui/*` (primitives). This documents what ships today and the targets from the master UI/UX prompt.

## Tokens: colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | #f6f3ee | #14161c | page |
| `--color-fg` | #1c2438 | #f3efe8 | body text (AA on bg in both modes) |
| `--color-muted` | #5c6578 | #b0b6c4 | secondary text (AA ≥4.5:1 on bg) |
| `--color-primary` | #1a3790 | #6d89d8 | one primary: CTAs, links, focus ring |
| `--color-accent` | = primary | = primary | target: a separate accent token (see punch-list P-07) |
| `--color-border` | #e2e8f0 | #3d4556 | hairlines |
Theme: system-aware (`prefers-color-scheme`) plus a manual toggle. **Target: dark by default** (punch-list P-01; not flipped in this PR because it changes every visual baseline).

## Type
Plus Jakarta Sans for body and display. Weights 500/600 only. Minimum body size 14px, controls 16px on mobile (stops iOS zoom). Support dynamic type, and don't fix heights on text containers.

## Spacing: 8pt grid
4 / 8 / 12 / 16 / 24 / 32 / 48 (Tailwind 1, 2, 3, 4, 6, 8, 12). 4 is for icon-to-label gaps only.

## Radii
| Element | Target | Current token |
|---|---|---|
| Cards, sheets | 8px | `--radius-sm` (some cards still use md/lg: P-05) |
| Buttons, inputs | 4px | 6px `--radius-xs` (P-05) |
| Pills, chips, avatars | full | `rounded-full` |

## Elevation
Flat by default. Only floating layers get shadows: sheets, popovers, the help bubble, toasts.

## Icons
lucide-react with a 1.5px stroke. 20px (`size-5`) in headers and toolbars, 16px inline. Every icon-only control has `aria-label` and `title`, and the icon is `aria-hidden`.

## Components (states required: default / hover / focus-visible / pressed / disabled / loading / success / error / empty)
- **Button**: primary, secondary, ghost, icon. Icon buttons are at least 44×44 (`size-11`). Focus uses a 2px primary ring with a 2px offset.
- **ThreadCallActions** (new, `src/components/thread-call-actions.tsx`): phone, then video, in the thread header. It's the one component for the parent thread and the daycare desk inbox, so the two can't drift. Phone shows when `voiceReady` (FEATURE_VOICE plus credentials). Video shows when the video surface is on.
- **Call panels** (voice/video): states are loading → waiting/ringing → live → ended/error. Errors are calm, one line, with a retry. No upsell copy while subscriptions are off.
- **Background ring client** (`src/lib/call-ring-client.ts`): starting a call calls `startCallRing`. The ring is cancelled on answered, hang-up, decline, or a 25 s timeout. While FEATURE_CALL_PUSH is off (the current setting), the server returns early.
- **Inputs**: label above, helper/error below with `aria-describedby`, error in text and not only in colour.
- **Empty states**: one sentence plus one primary action. No illustrations of children's faces.

## Motion
150–200 ms ease-out for state changes. Tap feedback under 100 ms (`active:` scale/opacity). Everything is disabled under `prefers-reduced-motion`.

## Accessibility
WCAG 2.1 AA: contrast, keyboard order, visible focus, SR labels, 44–48pt targets. EN and FR copy must be complete. The other 8 locales must not overflow, so test the longest one (de/tl) at 320px.
