-- One parent form can create several spot requests. Each centre still gets
-- its own booking and conversation. Consent and subsidy interest are stored
-- on the booking. They are never invented from a blank form.

alter table bookings add column if not exists subsidy_interest boolean;
alter table bookings add column if not exists share_consent_at timestamptz;
alter table bookings add column if not exists batch_id text;

create index if not exists bookings_user_created_idx
  on bookings (user_id, created_at desc);
