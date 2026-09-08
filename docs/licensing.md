# Licensed badge and provincial registry adapters

KidEase shows a **Licensed** badge only when we can verify the centre against a
trusted source. Absence of the badge is not a claim that the centre is
unlicensed. KidEase never invents a licence number.

## What parents see

- **Listing cards** and **listing detail** show a compact Licensed badge (tooltip
  + `aria-label`) when `license_status` or `registry_match_state` is `matched`.
- Expired or suspended licences show those words instead. They are never painted
  as Licensed.
- Unverified listings show no Licensed badge. The licence record section still
  says Unverified and links to the official registry.

Manitoba listings with a real licence number in the bundled snapshot get the
badge at read time. The tooltip says the match is a local catalogue snapshot,
not a live government scrape. Official inspections stay on
[childcaresearch.gov.mb.ca](https://childcaresearch.gov.mb.ca/en).

## How verification is stored (Neon)

`daycares` already has the trust columns from `migrations/0023_canada_trust.sql`:

| Column | Honest use |
| --- | --- |
| `province` | Jurisdiction for the adapter |
| `license_number` | Provincial number when we have one. Sequential source IDs stay hidden. |
| `license_status` | `unverified` (default), `matched`, `expired`, `suspended` |
| `registry_match_state` | `unmatched`, `pending`, `matched`, `mismatch` |
| `license_verification_source` | e.g. `local_catalog` after an MB snapshot hit |
| `license_verified_at` | Set only when an operator or admin records a check |
| `licensed_capacity` / `license_expiry` | Optional facts; never guessed |

`ca_jurisdictions.adapter_status` is `adapter_ready` for Manitoba (local
snapshot) and `stub` for every other province and territory.

## Manitoba path (safe, no scrape)

1. Bundled index: `src/lib/data/mb-registry-index.json` (licence number, name, city).
2. Lookup: `lookupRegistry("MB", licenseNumber)` in
   `src/lib/server/registry-adapters.ts`. In-memory map only.
3. Read-time overlay: `applyLocalRegistryTrust` on catalogue hydrate and Neon
   row mapping. Listing load does **not** fetch the government site.
4. Optional persist during `npm run ops:seed-catalog`: matched unclaimed rows
   get `license_status = matched` and `registry_match_state = matched`. Claimed
   rows, expired/suspended, and admin `mismatch` are left alone.

Do not add a “Sync now” button that pretends a live scrape ran.

## Extending to another province

Use official **open data** or a documented API. Do not scrape a search HTML UI.

1. Add a committed snapshot or feed client under `src/lib/data/` (or a private
   ops repo) with licence number + identity fields you can match without guessing.
2. Implement `lookupRegistry` for that code. Keep `ok: false` until a real hit.
3. Set `adapter_status` to `adapter_ready` in `src/lib/province-registry.ts` and
   `migrations/0023_canada_trust.sql` (or a follow-up migration).
4. Leave `stub` notes pointing at the official registry URL.
5. The same Licensed badge lights up when `license_status` / `registry_match_state`
   become `matched`. No UI fork per province is required.

Until that feed exists, the adapter stays a stub and the badge stays off.

## What we will not do

- Invent or pad licence numbers so a badge can appear.
- Block nearby search or listing detail on an outbound scrape.
- Call a listing Licensed because it is in `centres.json` / Neon without a match.
- Claim KidEase police-checks staff or replaces the official inspection record.
