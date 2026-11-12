# Saved-centres map (P06 / G03)

`ParentShortlist` passes `itemsOnly` to the shared `MapView`. This mode uses only
the supplied saved cards. It does not load directory viewport tiles or general
viewport results, and it ignores previously loaded viewport data when drawing.
The normal search map keeps its existing viewport behavior.

The map starts framed around the saved centres, hides the search-radius circle,
and labels its scope “Saved centres only” in English or French. The accessible
map count comes from the saved markers. Panning redraws that saved set without
adding nearby centres.

`listPinsForCamera` accepts an optional `itemsOnly` option because its usual
camera-size limits are only for temporary search-list seeding. A saved map has
no later viewport response, so it must also draw at close and country zooms.

Local regression: `node --experimental-strip-types --test scripts/saved-map.test.mjs`.
It checks one saved pin at phone/desktop camera shapes and close/country zooms,
pan-away/back behavior, empty saved lists, and independence from a populated
general-results cache. This is local test coverage, not live verification.

Local browser acceptance on 12 November 2026 also exercised the actual `MapView`
with the real MapLibre/OsmMap adapter, a synthetic local basemap, and directory
functions that record and reject calls in items-only mode. All 16 combinations
of 390/1280 px, clean/classic, light/dark, and English/French rendered one saved
pin. Zooming to 18 and 4, panning away/back, and emptying/restoring the saved set
made no directory requests. A seventeenth case switched a general map with two
pins to one saved pin without another directory request. No external requests
were made by this fixture. This does not verify the production saved map.
