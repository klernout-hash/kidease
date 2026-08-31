# KidEase responsive layout

Fluid layout from **320px to 2560px**. No separate mobile site. Desktop at ≥1280px stays as designed; narrower widths reflow.

## Breakpoint ladder

| Name | Width | UI |
|---|---|---|
| Small phone | 320–374 | Drawer nav. Single column. Full-width CTAs. |
| Phone | 375–429 | Same, more air. |
| Large phone | 430–639 | Drawer. Cards may peek. |
| Small tablet | 640–767 | 2-col cards. Drawer. |
| iPad portrait | 768–1023 | Drawer (full desktop nav does not fit). Hero 2-col if photo ≥280px. Cards 2-col. Map+list stacked. |
| iPad landscape / small laptop | 1024–1279 | Drawer unless every header link fits with ≥16px gaps. Cards 2–3 col. Map+list side-by-side if each pane ≥320px. |
| Desktop | ≥1280 | Current desktop header, 2-col hero, 3-col cards. |

`xl` (1280) is the desktop header. Below that: `[logo] [English] [☰]` plus a right-hand drawer (~86vw phones, max 24rem / 380px on iPad).

## Drawer

- 48×48 hamburger, 3-line → X
- Overlay `bg-black/40` + blur, 300ms cubic-bezier(0.22, 1, 0.36, 1)
- Body scroll locked while open
- Close: overlay, Escape, route change, Android back (`popstate`)
- Focus trap, `aria-expanded` / `aria-controls`
- Rows: Explore, Childcare Benefits Program, Saved, About, Meet the Team, Contact, Inbox/Get the App, Parent Sign In (filled), Daycare Sign In (outline), language

Phone-only bottom tabs (Explore · Saved · Inbox · Provider · Account) hide at `md` (768). Compare bar sits above them and uses `env(safe-area-inset-bottom)`.

## Trust chips

- <768: horizontal snap carousel
- 768–1023: 2×2
- ≥1024: 4-across

## Search / Explore

- <1024: full-width field, 16px font, navy Search **under** the field
- Phone: list first, Map/List toggle, map ~45dvh
- iPad portrait: stacked list then map
- ≥1024: side-by-side when each pane is wide enough
- Cards: 1 col <640, 2 col 640–1023, 3 col ≥1024 (1 col beside the map until `xl`)

## Safe areas & viewport

- `viewport-fit=cover` (already in root)
- Sticky header: `env(safe-area-inset-top)`
- Bottom chrome: `env(safe-area-inset-bottom)`
- Heroes/min-heights use `dvh`, not `100vh`
- Inputs ≥16px (no iOS zoom)
- Tap targets ≥44×44 (48px preferred)

## QA widths

320, 360, 375, 390, 412, 430, 768, 820, 834, 1024, 1080, 1180, 1194, 1366, 1440, 1920.

Pass: no horizontal scroll; every header link reachable; homepage desktop look preserved at ≥1280; Explore usable one-handed; rotation and Chrome toolbar show/hide do not break sticky chrome.
