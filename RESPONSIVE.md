# KidEase layout: website vs app

One codebase, **two looks**. Same listings and accounts.

| | **App** | **Website** |
|---|---|---|
| When | Phone-width web **&lt; 1024px (`lg`)**, **or** Capacitor iOS/Android (any width) | Browser at **≥ 1024px**, and **not** in the native shell |
| Chrome | Bottom tabs: Search, Saved, Enrolled, Messages, Profile | Top nav: Explore, Benefits, About, Get the app (full header at ≥1280) |
| Home | Location + swipe rails, square cards, heart | Wide hero, How it works, 3-across storefront cards, Google rating, View details / Licence record, parent quotes |
| Explore | Map + list sheet, compact cards | Map + list side by side, storefront cards |

Detection lives in `src/lib/runtime.ts`: `resolveChannel({ native, widthPx })` writes `html[data-channel=app|website]`. A boot script in `__root` sets the attribute before paint.

Do not stretch the phone card to fill a desktop window. Do not shrink the website card to the phone size.

## Breakpoint ladder

| Name | Width | Surface (web) |
|---|---|---|
| Phone | 320–1023 | App |
| Laptop / desktop | ≥1024 | Website (drawer until 1280) |
| Native shell | any | App |

`xl` (1280) is the desktop header on the website. Below that on website: `[logo] [English] [☰]` plus a right-hand drawer.

## Drawer

- 48×48 hamburger, 3-line → X
- Overlay `bg-black/40` + blur, 300ms cubic-bezier(0.22, 1, 0.36, 1)
- Body scroll locked while open
- Close: overlay, Escape, route change, Android back (`popstate`)
- Focus trap, `aria-expanded` / `aria-controls`

App bottom tabs hide on the website channel. Compare bar sits above them and uses `env(safe-area-inset-bottom)`.

## Trust chips

- App: horizontal snap carousel
- Website 1024–1279: 2×2
- Website ≥1280: 4-across

## Search / Explore

- App: list first, Map/List sheet, map ~45dvh
- Website: side-by-side when each pane is wide enough
- Cards: compact squares on app; storefront cards on website (1 col beside the map)

## Safe areas & viewport

- `viewport-fit=cover` (already in root)
- Sticky header: `env(safe-area-inset-top)`
- Bottom chrome: `env(safe-area-inset-bottom)`
- Heroes/min-heights use `dvh`, not `100vh`
- Inputs ≥16px (no iOS zoom)
- Tap targets ≥44×44 (48px preferred)

## QA widths

320, 360, 375, 390, 412, 430, 768, 820, 834, 1024, 1080, 1180, 1194, 1366, 1440, 1920.

Pass: a reviewer can tell desktop www.kidease.ca is the storefront site and a phone-width or native shell is the compact tabbed app, sharing the same listings.
