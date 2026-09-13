# Tour calendar v1 — Production merge notes

Kyle: built-in calendar for **tours + availability only**. Not staff scheduling, not Google Calendar sync, not payroll, not Clerk.

## What shipped

| Surface | Behaviour |
| --- | --- |
| **Daycare desk → Tour times** | `/provider?desk=tours`. Date/time blocks, capacity (1–12 families), timezone default **America/Winnipeg** with a Canada-zone override. Optional “repeat weekly for 4 weeks”. |
| **Public listing** | **Book a tour** stays a separate CTA from **Request info**. It opens a slot picker. Upcoming posted times also render on `/daycare/{slug}` (`#listing-tours`). |
| **Parent / guest** | Signed-in or guest. Guest needs first, last, phone, email (same honesty as Request info). Booking writes a **soft-hold** (`tour_requests.status=pending`, `hold_expires_at` + 48h) + `lead_requests` (`kind=tour`). This is a visit request, not Instant Book placement. |
| **Empty honesty** | No posted windows → “has not posted tour times”. All past/full → “none open right now”. KidEase does not invent slots or fall back to free-form preferred times. |
| **Neon** | Migrations **0045** + **0049**. `daycares.timezone`, `tour_windows`, `tour_requests.window_id` + guest contact + `hold_expires_at`. Status may be `expired` when a soft-hold times out. |
| **Inventory** | Posted windows show **Open / Soft-hold / Confirmed / Blocked**. Pending holds a seat; expired / declined / cancelled frees it. |
| **Provider SLA** | Today + Tour card: **Accept · Propose time · Decline (+ reason)**. Confirm / cancel / reschedule emails both sides (Resend via `notifyThreadParty`) and uses the existing push path when `FEATURE_PUSH` is on. |

## Desk → listing proof path

1. Director signs in → `/provider?desk=tours`.
2. `saveTourWindows` / `setDaycareTimezone` write Neon.
3. Public `listPublicTourSlots` reads remaining seats (`pending` + `accepted` hold a seat).
4. `/daycare/{slug}` `ListingTourTimes` + `RequestTourSheet` show the same rows.
5. `bookTourSlot` creates the tour + lead; desk **Lead inbox** / **Tour requests** confirm or decline.

## Out of scope (this PR)

- Employee shift scheduling
- Google Calendar full sync
- Closures / holidays (add later if needed; do not invent them here)
- Payroll, inventory, Clerk

## After merge

1. `npm run db:migrate` (already on `vite build`) so **0045** lands on Neon.
2. Claim a live centre, add one future tour block, confirm it on the public listing.
3. Book as a guest and as a signed-in parent; confirm/decline on the daycare desk.
4. Leave a listing with no windows and confirm Book a tour is empty, while Request info still works.
