-- One reminder per tour request. Sent by the existing hourly tour job.
-- No child name is stored here.

create table if not exists tour_reminders (
  id text primary key,
  tour_id text not null,
  user_id text not null,
  daycare_name text not null,
  locale text not null default 'en',
  email text,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists tour_reminders_tour_uidx
  on tour_reminders (tour_id);

create index if not exists tour_reminders_due_idx
  on tour_reminders (remind_at)
  where sent_at is null;
