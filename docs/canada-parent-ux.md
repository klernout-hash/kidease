# Canada parent UX pack — Production merge notes

Kyle rule: every field a daycare fills on the provider/claim desk persists in Neon and renders on `/daycare/{slug}`. No orphan UI. No fake openings or verified badges.

## A–D → files

| Scope | What shipped | Files |
| --- | --- | --- |
| **A. Explore chips** | Age / Openings / Schedule / Facility chips → checkbox modal → Apply. URL `?ages=&open=&sched=&fac=`. FR-CA labels via `copy.ts` on `/fr` (and `/search` when locale is fr). Options hide when no live public listing can match. Immediate/Upcoming never appear without honest vacancy data. | `src/lib/parent-listing.ts`, `src/components/explore-filter-chips.tsx`, `src/routes/search.tsx`, `src/lib/copy.ts` |
| **B. Listing + cards** | Header pills (openings, city, centre/home/school, licensed, updated). Dual CTAs: Request info + Book a tour. Jump nav: Programs, Reviews, Photos, Location, Fees. Programs table + snapshot grid from desk fields. Card: photo, name, km, licensed, openings, 1–2 age chips, Request info. | `src/components/listing-parent-pack.tsx`, `src/routes/daycare.$slug.tsx`, `src/components/daycare-card.tsx`, `src/components/listing-badges.tsx` |
| **C. Request info** | First, last, phone, email, optional message. Privacy line. SLA only if claimed + contact email + transactional mail (Resend/Titan) is configured; otherwise honest variant. Durable success UI. Lead `kind=info` → daycare inbox + `notifyPlatform` / `notifyThreadParty` (existing Titan/Resend path). Guests persist as `guest:<email>`. | `src/components/request-info.tsx`, `src/lib/server/lead-requests.ts`, `src/lib/lead-requests.ts`, `migrations/0044_canada_parent_listing.sql` |
| **D. Daycare desk** | Facility type, schedule, openings window, age programs + fees, financial flags, curriculum, languages (existing culture fields), optional values note, safety, amenities, promo/tagline/description. Save → Neon `daycares.*` → `mapDaycare` → public listing + search filters. | `src/components/provider-parent-fields.tsx`, `src/components/provider-listing-forms.tsx`, `src/lib/server/claims.ts` (`updateListing`), `src/lib/server/map-row.ts` |

## Daycare edit → listing proof path

1. Provider signs in → `/provider?desk=listings`.
2. `CapacityForm` + `ProviderParentFields` submit `updateListing`.
3. Neon `daycares` columns: `facility_type`, `schedule_options`, `opening_window`, `programs`, `financial_flags`, `curriculum_tags`, `values_note`, `safety_features`, `promo_text`, plus existing `amenities`, `tagline`, `description`, fees/spots, `staff_languages`.
4. Public `/daycare/{slug}` loads `getDaycare` → claimed row `mapDaycare` / `parentListingFrom`.
5. Same object feeds search chips (`matchesParentListingFilters`) and cards (`listingAgeChips`, honest vacancy).

Unclaimed catalogue rows still derive facility from amenities only (`home`, `nursery`, `in-school`). Names never assign a type. Openings stay `honestVacancy` (fresh claimed spots) — `opening_window=upcoming` only surfaces when vacancy data exists.

## Production merge notes

- Run `npm run db:migrate` (already on `vite build`) so **0044** lands on Neon before desks save the new columns. The update is wrapped in `.catch` so a lagging DB does not break name/fee saves.
- Do **not** invent Resend keys. SLA copy is honest when mail or a claimed inbox is missing. Existing Titan SMTP fallback on main stays the notify path.
- Out of scope (unchanged): Clerk, Meta Live, DocuSign, Stripe, US religion laundry lists.
- Search `/fr/search` remains the FR marketing landing; chips live on `/search` with FR-CA chrome when the locale is French.
- After merge, claim one live centre, fill facility + schedule + a program fee, confirm spots, then confirm the public listing pills/table and `?fac=home` / `?open=immediate` hide when data cannot match.

## Footer

Four audience columns: **Parents** / **Daycares** / **Caregivers & jobs** / **KidEase**.

- Daycares: **Find daycare jobs** → `/jobs` (`/fr/jobs`). Honest Canada waitlist — no invented openings.
- KidEase: **Add jobs at KidEase** → `/jobs/post` (`/fr/jobs/post`). Centre note uses existing `submitPublicMessage` (`kind: "contact"`).
- Caregivers column is the fourth menu. Open Road brand stays out. King-admin / auth unchanged.
