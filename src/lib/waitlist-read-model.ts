/** Saved area searches are private watches. The read model keeps their source
 * distinct from centre-specific demand and from a confirmed enrollment.
 */
export const WAITLIST_READ_SQL = `(
  select 'centre' as source, id, user_id, daycare_id, age_group, status,
    joined_at as created_at, updated_at, rank_order, child_label,
    null::text as batch_id, null::text as start_month,
    null::text as center_label, null::text as postal_code, null::int as radius_km, null::date as start_date
  from daycare_waitlist
  union all
  select 'interest', id, user_id, daycare_id, age_band, 'interested',
    created_at, updated_at, null, null, null, null, null, null, null, null
  from waitlist_interests
  union all
  select 'area', id, user_id, null, age_band, 'watching',
    created_at, updated_at, null, null, null, null, center_label, postal_code, radius_km, start_date
  from saved_searches
  where kind = 'waitlist_area' and alerts_enabled = 1
  union all
  select 'booking', id, user_id, daycare_id, age_group, status,
    created_at, status_updated_at, null, null, batch_id, start_month::text, null, null, null, null
  from bookings
)`;

export const CENTRE_WAITLIST_DEMAND_SQL = `(
  (w.source = 'centre' and w.status in ('waiting', 'offered'))
  or w.source = 'interest'
  or (w.source = 'booking' and w.status = 'waitlist')
)`;

/** The government report counts centre waitlist entries. Its existing city,
 * age and province scope feeds the same small-count suppression.
 */
export const WAITLIST_DEMAND_CELLS_SQL = `
  select d.province, d.city, w.age_group, count(*)::int as n
  from ${WAITLIST_READ_SQL} w
  join daycares d on d.id = w.daycare_id
  where w.source = 'centre' and w.status = 'waiting' and upper(btrim(d.province)) = $1
  group by d.province, d.city, w.age_group
`;
