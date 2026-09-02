# KidEase layout: website vs app

One product, **two surfaces**. Same listings and account — different chrome.

| | **Phone / app** (<768px, PWA, App Store) | **Website** (≥768px laptop/desktop) |
|---|---|---|
| Chrome | Bottom tabs: Search, Saved, Enrolled, Messages, Profile | Top nav: Explore, Benefits, About, Get the app |
| Cards | Compact ~172px, 2-up, horizontal rails | ~296px, 3–4 across, page grid |
| Home | Logo, headline, Use my location | 2-col hero + photo, trust bar, How it works, listing grid |
| Explore | List first, Map toggle, Filters sheet | Map + list side by side |

Do not stretch the phone card to fill a desktop window. Do not shrink the website card to the phone size.

## Breakpoint ladder

| Name | Width | Surface |
|---|---|---|
| Phone | 320–767 | App |
| Tablet / laptop | 768–1279 | Website (drawer until 1280) |
| Desktop | ≥1280 | Website, full header |

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
