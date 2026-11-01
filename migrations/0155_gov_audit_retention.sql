-- Append-only compliance audit. FEATURE_AUDIT_RETENTION defaults off.
-- Practice mode lists rows past the retention date and deletes nothing.
-- Ontario keeps required records at least 3 years: O. Reg. 137/15 s. 82(1).
alter table profiles add column if not exists gov_province text;
update profiles p set gov_province = upper(o.province)
from government_members m join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active' and (p.gov_province is null or btrim(p.gov_province) = '');

create table if not exists compliance_audit_log (
  id text primary key,
  actor_id text,
  province text,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);
create index if not exists compliance_audit_log_province_idx on compliance_audit_log (province, created_at desc);

create or replace function compliance_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'compliance_audit_log is append-only';
end;
$$;
drop trigger if exists compliance_audit_log_no_update on compliance_audit_log;
create trigger compliance_audit_log_no_update
  before update on compliance_audit_log
  for each row execute procedure compliance_audit_log_immutable();

create table if not exists retention_rules (
  province text primary key,
  years int not null,
  verified int not null default 0,
  source text not null
);
insert into retention_rules (province, years, verified, source) values
  ('ON', 3, 1, 'O. Reg. 137/15, s. 82(1). Keep a required record at least three years. https://www.ontario.ca/laws/regulation/150137'),
  ('MB', 3, 0, 'PLACEHOLDER. Three years matches Ontario until Manitoba''s schedule is confirmed.'),
  ('BC', 3, 0, 'PLACEHOLDER. Confirm the retention schedule before a live purge.'),
  ('AB', 3, 0, 'PLACEHOLDER. Confirm the retention schedule before a live purge.'),
  ('QC', 3, 0, 'PLACEHOLDER. Confirm the retention schedule before a live purge.')
on conflict (province) do nothing;
