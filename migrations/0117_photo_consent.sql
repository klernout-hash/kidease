-- Parent consent for classroom photos. The photo itself stays on the journal row.
-- FEATURE_PRIVATE_PHOTO_FEED stays off until Kyle turns it on.

alter table bookings
  add column if not exists photo_consent_at timestamptz;
