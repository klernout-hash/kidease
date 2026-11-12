# Government analytics scope (V01)

Fee buckets, listing/vacancy/job trends, job-post totals, and accepted-offer averages retain their listing city until the selected province, region, and city have been applied. Region rows use the same filtered city set. City selectors retain the province's publishable choices so a user can switch cities.

City matching uses the existing Manitoba aliases (including Wpg) and ignores case and French accents. A region without a loaded census population has no population-per-space ratio. Counts under five and complementary suppression still apply after scope selection.

Otherwise-public listings with missing coordinates remain in directory and fee totals. Missing coordinates do not contribute to the city map average, and an area without a usable point is omitted from the map.

Saved-search demand has province attribution only. On a city or region view, its panel and CSV rows explicitly describe the province-wide context. The separate job context panel is also province-wide and labelled as such. National survey context remains labelled separately. No city demand is inferred from a search label.

## Verification

`scripts/gov-analytics-scope.test.mjs` exercises two-city analytics, province totals and weighted fill averages, region scope, English/Manitoba aliases, French accented names, CSV attribution, and small-group/complementary suppression. An in-memory PGLite fixture executes the production city and fee query text to verify that unmapped public listings count, hidden fixtures do not, alias map averages use mapped records only, and an entirely unmapped city has no map point.

Local component renders use the actual dashboard and shared CSS with synthetic data and stubbed server boundaries. The sample has eight Winnipeg listings with eight cited-fee centres, compared with twenty listings province-wide. Phone and desktop captures cover 390px and 1280px, clean and classic, light and dark, and English and French. These are local visual checks, not a live-site acceptance result.

Validation passed: 23 targeted government tests, TypeScript, changed-file ESLint, and 17 local render cases (the 16 width/look/theme/language combinations plus a province comparison). The render assertions found no page errors or horizontal page overflow. No production account, database, health endpoint, or external network request was used for these renders.

Representative captures: [390px clean/light English](audits/evidence/local-gov-390-clean-light-en.png), [1280px clean/light English](audits/evidence/local-gov-1280-clean-light-en.png). The [visual results](audits/evidence/local-gov-results.json) record all 17 local cases; the other captures remain local evidence and are not checked in.

Local tests do not establish live behaviour. After Kyle approves a release, verify `/gov/analytics?province=MB&region=Winnipeg&city=Winnipeg` against the whole-province view at 390px and 1280px. Confirm fees and trends match Winnipeg; demand and job context state their wider scope. Repeat a French city/region view and a group under five. Do not use production health requests for this check: the existing health handler can run an age backfill.

No flags, migrations, clean-look default, or deployment settings change in this fix.
