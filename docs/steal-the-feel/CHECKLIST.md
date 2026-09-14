# Engineering checklist

Work top to bottom. Each box needs a file + a guest-session screenshot or a test. Do not tick from the mock alone.

Production is unchanged until a follow-up PR. This list is the implementable queue from [BRIEF.md](./BRIEF.md).

## 0. Tokens (apply PR)

- [ ] Primary remains `#1A3790` (`--color-primary`, `THEME_COLOR_LIGHT`, map pin SVG).
- [ ] `--color-soft: #eef2fb` added; home hero wash uses the token, not a raw hex.
- [ ] Home / Search / Listing use **one** radius (14px) and **one** shadow (`--shadow-card`).
- [ ] Type uses the ramp in [TOKENS.md](./TOKENS.md) — no new `clamp()` / `text-[…]` one-offs.
- [ ] Spacing on those three pages snaps to the 8pt grid (8 / 16 / 24 / 32 / 48).
- [ ] Dark theme still readable; do not force navy buttons in dark without `--color-primary` dark.

## 1. Home hero — search only primary above the fold

Files: `src/routes/index.tsx`, `src/components/explore-search-bar.tsx`, `src/components/place-search.tsx`.

- [ ] First screen (website, ≥1024, guest): H1 + one subline + **one** search field + Search. No second `size="lg"` button in the hero.
- [ ] How it works is a section below the fold, not a hero CTA.
- [ ] Trust chips under the field (licensed / open spots / enquire) — three max, wrap, no horizontal page overflow.
- [ ] `RoleEnrollChooser` is not above the fold for a guest parent (move or drop from home).
- [ ] Locate / city hubs do not outrank Search. City hubs may sit under the field or on Search.
- [ ] App channel (`data-channel=app`) still locates + rails — do not port a second website hero.
- [ ] LCP preload for the hero still (`HERO_LCP_AVIF_SRCSET`) remains; search UI is CSS, not an extra image.
- [ ] FR-CA home (`src/routes/fr.index.tsx` or locale copy) matches the same hierarchy.

## 2. Search cards — photo-first, not hollow

Files: `src/components/daycare-card.tsx`, `src/components/photo-carousel.tsx`, `src/lib/listing-photo.ts`, `src/lib/photo-honesty.ts`.

- [ ] Photo is the first painted block. `aspect-[4/3]` (website) / compact square (app) **before** decode (CLS).
- [ ] Card images use `CARD_WIDTHS` / `CARD_SIZES` only (320–768). No 1200 on search tiles.
- [ ] First four tiles may be `eager`; the rest lazy.
- [ ] Placeholder / remapped stills (`storefront-placeholder`, unflagged shared hashes) show **photo pending** and do not dominate the first page of results.
- [ ] Mixed Winnipeg / Edmonton / QA fixtures: real photos sort above hollow tiles, or hollow tiles are collapsed.
- [ ] Name, ages, honest vacancy, fee (if confirmed), km. No invented spots or stars.
- [ ] Heart / save does not cover the name. Tap targets ≥44px.

## 3. Search — sticky chips, density, overflow, map

Files: `src/routes/search.tsx`, `src/components/explore-filter-chips.tsx`, `src/components/explore-category-chips.tsx`, `src/components/map-view.tsx`.

- [ ] Ages / Open spots / Fee (or schedule) chips are visible without opening Filters.
- [ ] Chip row is **sticky** under the search bar (below the site header). `z-index` under header (`z-50`), above cards.
- [ ] Phone: chips **wrap** or sit in a labelled horizontal scrollport that **cannot** grow `document` width. `overflow-x-hidden` on the page. No `flex-nowrap` on `data-search-row="live-filters-map"` without a max-width scrollport + fade.
- [ ] Density: website list is one storefront column beside a contained map; app stays compact rails / list. No mixed card sizes in one pane.
- [ ] Map is a peer pane, not a full-viewport overlay. Phone map ≤ ~45dvh; desktop map is a column, not `70vh` over the list.
- [ ] `MapView` stays `lazy` and mounts only when Map is selected (`mapEnabled`).
- [ ] List of 20+ results is virtualized (or windowed). First paint does not mount 80+ `DaycareCard`s.
- [ ] Filter / radius / query URL writes are debounced 200–300ms. Chip apply still feels instant (optimistic UI ok).
- [ ] Empty / gated / licensed-not-live copy unchanged and honest.

## 4. Listing — gallery first, sticky CTAs

Files: `src/routes/daycare.$slug.tsx`, `src/components/listing-parent-pack.tsx`, `src/components/request-info.tsx`, `src/components/request-tour.tsx`.

- [ ] Review slug: `/daycare/seven-oaks-sadok-inc-2029` (and `/listing/seven-oaks-sadok-inc-2029` → same).
- [ ] Gallery is the first content block after crumbs. Hero aspect is not `2/1` on desktop; title + facts share the first viewport with the gallery.
- [ ] Hero / thumbs keep a fixed aspect (`DETAIL_SIZES`, `BuildingPhoto`) — no CLS when the still swaps.
- [ ] Facts row: ages, hours, monthly fee (or unknown), open spots (honest). Info icon may explain unknown — it does not invent a number.
- [ ] Desktop aside sticky: fee + Enquire + Request a tour (`lg:sticky`).
- [ ] Mobile bar sticky: **Enquire** and **Request a tour** only, equal width, no horizontal scroll, `env(safe-area-inset-bottom)`, above app tabs.
- [ ] Enquire → existing request-info lead. Tour → existing book-tour / hold. No new product.
- [ ] Unclaimed / not-live: no false SLA. Claim link stays.

## 5. Performance

- [ ] Search cards: light images only (see §2).
- [ ] Search list virtualized (see §3).
- [ ] Map lazy (see §3).
- [ ] Aspects reserved (cards, hero, thumbs) — CLS ~0 on Home / Search / Listing.
- [ ] Filters debounced (see §3).
- [ ] Home LCP still preloaded; listing hero uses `priority` on the first still only.
- [ ] No new webfonts. Plus Jakarta stays `font-display: swap`.

## 6. Guest review / chrome

- [ ] Capture session is a **pure guest**. `DeskSwitcher` hidden (`showDeskSwitcher` false).
- [ ] If a leftover parent/provider cookie shows desk pills, sign out and re-open `/`, `/search`, `/daycare/seven-oaks-sadok-inc-2029`.
- [ ] Website vs app channel still matches [RESPONSIVE.md](../../RESPONSIVE.md) (do not stretch phone cards on desktop).
- [ ] EN + FR-CA labels present for any new string.

## 7. Done / Kyle review

- [ ] Guest walkthrough: Home search → Search (Winnipeg) → Listing (`seven-oaks-sadok-inc-2029`).
- [ ] Phone 390 and desktop 1440: no horizontal overflow on Search chips; map does not eat the list; listing CTAs visible without scroll-away.
- [ ] No competitor assets in the diff.
- [ ] Honest vacancy / licence rules from [canada-parent-ux.md](../canada-parent-ux.md) still hold.
