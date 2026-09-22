/**
 * Radius SQL shared by Live search and saved-search alerts.
 * ST_MakePoint is (lng, lat). The geography column uses the GIST index.
 * A row with lat/lng and a null geography still counts, so a Live centre
 * with a valid pin is not invisible.
 */

export const RADIUS_POINT_SQL = `st_setsrid(st_makepoint($1, $2), 4326)::geography`;
export const RADIUS_POINT_B_SQL = `st_setsrid(st_makepoint($4, $5), 4326)::geography`;
export const LISTING_PIN_SQL = `st_setsrid(st_makepoint(lng, lat), 4326)::geography`;

export const LISTING_GEOGRAPHY_SQL = `coalesce(location, case when lat is not null and lng is not null and not (lat = 0 and lng = 0) then ${LISTING_PIN_SQL} else null end)`;

export const LISTING_WITHIN_RADIUS_SQL = `(
  (location is not null and st_dwithin(location, ${RADIUS_POINT_SQL}, $3))
  or (
    location is null
    and lat is not null
    and lng is not null
    and not (lat = 0 and lng = 0)
    and st_dwithin(${LISTING_PIN_SQL}, ${RADIUS_POINT_SQL}, $3)
  )
)`;

export const LISTING_WITHIN_RADIUS_B_SQL = `(
  (location is not null and st_dwithin(location, ${RADIUS_POINT_B_SQL}, $3))
  or (
    location is null
    and lat is not null
    and lng is not null
    and not (lat = 0 and lng = 0)
    and st_dwithin(${LISTING_PIN_SQL}, ${RADIUS_POINT_B_SQL}, $3)
  )
)`;

export const LISTING_DISTANCE_KM_SQL = `st_distance(${LISTING_GEOGRAPHY_SQL}, ${RADIUS_POINT_SQL}) / 1000.0`;
