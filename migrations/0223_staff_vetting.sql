-- Staff job board: the provider's own checklist for one application.
-- The provider ticks each line. KidEase does not verify papers.
-- To undo: see migrations/down/0223_staff_vetting.sql

create table if not exists staff_vetting_checks (
  application_id text not null,
  item text not null,
  state text not null default 'to_do',
  note text not null default '',
  checked_by text,
  checked_at timestamptz,
  primary key (application_id, item),
  check (item in ('certificate', 'first_aid', 'background_check', 'references')),
  check (state in ('to_do', 'checked', 'not_needed'))
);
