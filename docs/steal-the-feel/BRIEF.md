# Steal-the-feel brief

Kyle review kit. Apply marketplace **clarity** to KidEase branding. Do not pixel-clone competitors.

Production today is the source of truth in `src/`. This brief names what to steal (pattern), drop (noise), and fix (concrete bugs) on Home, Search, and Listing.

## Priority fix queue

Ship in this order. Each item is one PR-sized change.

| # | Fix | Why first | Files |
| ---: | --- | --- | --- |
| 1 | **Home: search only primary above the fold** | Two hero CTAs + How-it-works + role chooser compete with “find a daycare”. | `src/routes/index.tsx` |
| 2 | **Search: photo-first cards + sticky filter chips** | Results must scan like a marketplace, not a form. Chips stay in view while scrolling. | `src/components/daycare-card.tsx`, `src/components/explore-filter-chips.tsx`, `src/routes/search.tsx` |
| 3 | **Search: fix density + hollow cards** | Mixed Winnipeg / Edmonton / QA placeholders read as empty tiles and kill trust. | `daycare-card.tsx`, `listing-photo.ts`, `photo-honesty.ts` |
| 4 | **Search: map overlay must not eat the viewport** | Map pane is `62dvh` (`lg:h-[70vh]`) — list disappears. | `src/routes/search.tsx`, `src/components/map-view.tsx` |
| 5 | **Search: mobile filter chips must not horizontal-overflow** | `flex-nowrap` + `overflow-x-auto` on `data-search-row="live-filters-map"` clips / scrolls sideways. | `src/routes/search.tsx` |
| 6 | **Listing: gallery first; hero not oversized vs title / facts** | `aspect-[16/10]` / `md:aspect-[2/1]` dwarfs the name and fee facts. | `src/routes/daycare.$slug.tsx` |
| 7 | **Listing: sticky Enquire + Request a tour on mobile** | Bar exists; labels are `Request info` / `Book a tour`. Keep both actions visible without sideways chip-scroll. | `daycare.$slug.tsx` sticky footer |
| 8 | **Tokens: one type scale, one radius, one shadow** | `@theme` currently has six radii and two shadows. Feel breaks when cards, chips, and heroes disagree. | `src/styles.css` ← apply from [TOKENS.md](./TOKENS.md) |
| 9 | **Perf habits** | Light card images, virtualized search, lazy map, fixed aspect (CLS), debounce filters. | see Performance below |

## Home

**Job:** Get a parent to a city / postal / FSA search in one action.

### Steal

- One search control above the fold: location field + primary Search. See [mock-home.png](./mock-home.png).
- Three quiet trust chips under the field (licensed / open spots / enquire) — not a second hero button row.
- Photo-first cards below the fold (or immediately under chips on desktop). Real classroom / storefront stills, fixed aspect, CAD + km.
- Soft `#EEF2FB` wash behind the hero (already used as `from-[#eef2fb]` on the website hero).

### Drop

- A second large primary in the hero (`How it works` beside `Find daycare`). How-it-works stays a section, not a competing CTA.
- `RoleEnrollChooser` above featured cards for a guest parent. Role pick is not the home job. Keep it below the fold or on `/claim` / `/contact`.
- City-hub chip walls and live/all toggles in the first screenful. Those belong on Search once a place is set.
- Decorative hero photography that outranks the search field.

### Fix

- **Search only primary above the fold.** Website hero in `index.tsx` currently: BrandMark, H1, subcopy, two `size="lg"` buttons, then `locationForm` (`ExploreSearchBar` / `PlaceSearch`). Collapse to: H1 → one line of subcopy → search field → Search → trust chips.
- App-channel home (`<[data-channel=app]>`) can keep locate + rails; do not port the dual-CTA website hero down.
- Featured grid already uses `DaycareCard`. Do not add a second card treatment.

## Search

**Job:** Compare honest listings near a place. Filter without losing the list.

### Steal

- Photo-first cards: photo is the card. Name, ages, spots, fee, km sit under (desktop list) or beside (row) the still. Heart is secondary.
- Sticky filter chips (Ages, Open spots, Fee / schedule / facility). Stick under the search bar; do not open a sheet for the first three filters.
- List \| map as a peer toggle. On desktop, a **contained** map column (not a full-viewport overlay). On phone, list first; map is a sheet or ~40% pane (`RESPONSIVE.md` already says ~45dvh for app).
- Result count in the title line (“32 daycare options in Winnipeg, MB”) — already close to `searchResultCount`.

### Drop

- Hollow / placeholder-looking cards dominating the first screen. `storefront-placeholder` and remapped shared stills (`photo-honesty.ts`, including `2029.jpg`) must not fill a Winnipeg search.
- Extra filter chrome that is not a chip (radius slider, AI match textarea, dual-anchor) in the first paint. Keep them behind Filters.
- A map that replaces the list (`h-[62dvh] min-h-[18rem] … lg:h-[70vh]` in `search.tsx`).

### Fix

- **Density.** Website list beside a map should be one column of storefront cards (`RESPONSIVE.md`). App stays compact squares. Do not mix both treatments in one pane.
- **Avoid hollow cards.** Prefer listings with a real photo in the first page. If the result set is placeholder-heavy (mixed Winnipeg / Edmonton / QA), sort real stills first or show a single “photo pending” tile — never a grid of grey boxes.
- **Map overlay must not eat the viewport.** Cap the map region (suggestion: `min(40dvh, 28rem)` on phone, `minmax(20rem, 1fr)` column on `lg`). Lazy-mount as today (`lazy(() => import("@/components/map-view"))`) and do not enable until Map is chosen (`mapEnabled` already gates this).
- **Mobile filter chips must not horizontal-overflow.** Replace `flex-nowrap … overflow-x-auto` on `data-search-row="live-filters-map"` with wrap, or a sticky chip scroller that is `max-w-full` and does not grow the page width (`overflow-x-hidden` on the page, chips in a labelled scrollport with fade). Tap targets stay ≥44px (`RESPONSIVE.md`).
- Debounce chip / radius writes before refetch (see Performance).

## Listing

**Job:** Confirm this centre, then Enquire or Request a tour.

Canonical URL is `/daycare/:slug`. `/listing/:slug` redirects. Sample for review: **`seven-oaks-sadok-inc-2029`**.

### Steal

- Gallery first: one hero still + thumb row (already `#listing-photos`). Keep it the first block after crumbs.
- Title, licence, city, and the four facts (ages, hours, monthly fee, open spots) in the same viewport as the gallery — not below a tall hero.
- Sticky Enquire + Request a tour: desktop aside (`lg:sticky`) and mobile bottom bar. Always both, always visible.

### Drop

- An oversized hero (`md:aspect-[2/1]`) that pushes the H1 and fee facts off the first screen.
- A third primary in the mobile bar (share / call / directions can stay as icons). The bar must not become a horizontal chip dump (`overflow-x-auto` on the sticky row today).
- Fake “KidEase Daycare” marketing names. Use the real centre name (`displayCentreName`).

### Fix

- **Gallery first; hero not oversized vs title / facts.** Tighten hero to ~`aspect-[16/10]` on all breakpoints, or a 2-col desktop grid: gallery | title+facts+CTAs (see [mock-listing.png](./mock-listing.png)). Keep `DETAIL_SIZES` / `BuildingPhoto` so CLS stays zero.
- **Sticky Enquire + Request a tour on mobile.** Map copy to existing actions: Enquire → `requestInfo` / `onInfo`; Request a tour → `bookTour` / `onTour`. Do not add a third product. Two equal-width buttons, no horizontal scroll, `env(safe-area-inset-bottom)`, sit above app tabs (`[[data-channel=app]_&]:bottom-20` already).
- Unclaimed / not-live listings stay honest: no Enquire SLA you cannot keep (`canada-parent-ux.md`).

## Tokens

One type scale, one radius, one shadow. Full proposal: [TOKENS.md](./TOKENS.md).

| Token | Value | Today |
| --- | --- | --- |
| Primary | `#1A3790` | `--color-primary: #1a3790` (keep) |
| Soft | `#EEF2FB` | Hard-coded on the home hero only |
| Space | 8pt grid | Mixed `gap-2` / `p-4` / magic numbers |
| Radius | **14px** (`--radius-md`) | xs 6 / sm 10 / md 14 / lg 22 / xl 32 / device 36 |
| Shadow | **one** card shadow | `--shadow-card` and `--shadow-lift` |
| Type | Plus Jakarta Sans, one ramp | `clamp()` + ad-hoc `text-[1.65rem]` |

Do not introduce a second font. Do not pick up competitor type ramps.

## Performance habits

| Habit | Do | Today |
| --- | --- | --- |
| Light card images | `CARD_WIDTHS` 320/480/768, `CARD_SIZES`, AVIF/WebP via `/img` or CF transform. Quality ≤75. | [image-resizing.md](../image-resizing.md) — keep. Do not request 1200 on search cards. |
| Virtualized search | Window the list (`shownList`) once it exceeds ~20 tiles. Keep first 4 `eager`. | `shownList.map` in `search.tsx` — not virtualized. |
| Lazy map | Import stays lazy; construct Google maps only after Map is selected. Do not preload tiles on list view. | `lazy` + `mapEnabled` — keep. Shrink the pane (queue #4). |
| Fixed aspect (CLS) | Every card / hero / thumb has an aspect class before decode. | Cards `aspect-[4/3]`; listing hero already boxed. Do not remove. |
| Debounce filters | 200–300ms on radius, text, and chip-apply before `searchDaycares` / URL write. | Parent chips apply immediately (`ExploreFilterChips` `onApply`). |

LCP on Home stays the hero still (`HERO_LCP_AVIF_SRCSET` preload in `index.tsx`). Do not add a second preload.

## Copy (Canada)

Prefer existing keys. If labels change, add EN + FR-CA in `src/lib/copy.ts` — do not invent a third locale.

| Feel-pass label | Existing key | Keep honest |
| --- | --- | --- |
| Enquire | `requestInfo` (“Request info”) | Same lead form. SLA only when claimed + mail works. |
| Request a tour | `bookTour` (“Book a tour”) | Same tour hold path. |
| Open spots | vacancy via `honestVacancy` | Never invent a count. |
| Licensed | `publicLicenseBadge` | Catalogue-matched stays off guest cards. |

## Constraints

- KidEase / Canada only.
- No competitor brand assets in git or screenshots.
- No production behaviour change in the kit PR. Token files here are a proposal until a follow-up applies them.
- Guest review session: desk switcher must stay off (`showDeskSwitcher` is false without two desks).
