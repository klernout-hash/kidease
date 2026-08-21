-- Spot-request inquiry fields (Airbnb-style enrolment)

alter table bookings add column if not exists parent_note text;
alter table bookings add column if not exists days text;
alter table bookings add column if not exists conversation_id text;
alter table bookings add column if not exists start_date text;
alter table bookings add column if not exists parent_name text;

alter table messages add column if not exists kind text not null default 'chat';

create index if not exists bookings_conversation_id_idx on bookings (conversation_id);
create index if not exists bookings_daycare_id_idx on bookings (daycare_id);
