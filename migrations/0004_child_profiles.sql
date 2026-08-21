-- Care details a centre needs before the first day. Shared only after a parent
-- requests a spot (PIPEDA: limiting collection + purpose).

alter table children add column if not exists preferred_name text;
alter table children add column if not exists allergies text;
alter table children add column if not exists epi_pen boolean not null default false;
alter table children add column if not exists medical_notes text;
alter table children add column if not exists medications text;
alter table children add column if not exists doctor_name text;
alter table children add column if not exists doctor_phone text;
alter table children add column if not exists foods_like text;
alter table children add column if not exists foods_avoid text;
alter table children add column if not exists diet text;
alter table children add column if not exists likes text;
alter table children add column if not exists comfort_item text;
alter table children add column if not exists nap_routine text;
alter table children add column if not exists toilet text;
alter table children add column if not exists home_language text;
alter table children add column if not exists soothes text;
alter table children add column if not exists fears text;
alter table children add column if not exists emergency_name text;
alter table children add column if not exists emergency_phone text;
alter table children add column if not exists pickup_people text;
alter table children add column if not exists photo_ok boolean not null default false;
alter table children add column if not exists sunscreen_ok boolean not null default true;
