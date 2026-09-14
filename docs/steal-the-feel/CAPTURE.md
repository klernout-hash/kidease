# Live capture notes (feel pass)

Notes from the live pass that produced [mock-home.png](./mock-home.png), [mock-search.png](./mock-search.png), [mock-listing.png](./mock-listing.png). Re-check on a **guest** session before implementing.

## Review URLs

| Surface | URL |
| --- | --- |
| Home | `/` (website channel, ≥1024) and `/` at 390px |
| Search | `/search?q=Winnipeg` (also try Edmonton and an empty / QA query) |
| Listing | `/daycare/seven-oaks-sadok-inc-2029` — slug is live in `sitemap-listing-slugs.json` (`mb-2029`, Seven Oaks Sadok Inc.). `/listing/seven-oaks-sadok-inc-2029` must redirect here. |

Photo honesty: `mb-2029` / `/photos/wpg/2029.jpg` is in the shared-fallback set (`photo-honesty.ts`, `docs/image-resizing.md`). Expect a remapped or pending still — do not treat a street-view copy as a real classroom photo.

## What the live product did

### Search mix

Results can interleave **Winnipeg**, **Edmonton**, and **QA / fixture** rows in one list. That mix, plus remapped placeholders, is why hollow tiles dominate a first screen. Feel-pass search assumes one city (Winnipeg, MB) and photo-first cards.

### Map overlay heavy

On Map, `search.tsx` sizes the pane `h-[62dvh] min-h-[18rem] … lg:h-[70vh]`. The list is gone; the map is the page. Direction: contained column / ~45dvh sheet (`RESPONSIVE.md`), lazy (`mapEnabled` already).

### Mobile filter overflow

`data-search-row="live-filters-map"` is `flex-nowrap … overflow-x-auto whitespace-nowrap` (Live / All, Filters, Map). On a 390-wide guest phone the row scrolls sideways and can widen the page. Chips must wrap or stay inside a max-width scrollport.

### Listing hero oversized

`#listing-photos` hero is `aspect-[16/10] md:aspect-[2/1]`. On desktop the still is a wide banner; name, facts, and CTAs sit below the fold. Direction: gallery shares the first viewport with title + facts ([mock-listing.png](./mock-listing.png)).

### Role / desk switcher

`DeskSwitcher` renders when `showDeskSwitcher` is true — the session has **two visible desks** (`src/lib/desks.ts`). A leftover parent or provider cookie (or Kyle admin) shows Parent / Director pills on Home / Search / Listing.

For feel-pass review: **sign out** and use a pure guest. If pills appear, the session is not guest — do not design around them.

`RoleEnrollChooser` on guest home (`index.tsx` featured section) is a different control (Parent vs Daycare enroll). It is not the desk switcher, but it still steals the fold. See Home drop in [BRIEF.md](./BRIEF.md).

## Suggested capture matrix

| Viewport | Session | Pass |
| --- | --- | --- |
| 390 × 844 | Guest | Home search primary; Search chips no page overflow; Listing two sticky CTAs |
| 1440 × 900 | Guest | Home search-only hero; Search list + contained map; Listing gallery \| title |
| 1440 × 900 | Signed-in leftover | Confirm desk switcher — sign out before scoring the feel |
