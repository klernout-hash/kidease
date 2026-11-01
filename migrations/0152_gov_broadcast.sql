-- Emergency notices. FEATURE_GOV_BROADCAST defaults off.
-- Practice mode records delivery rows as logged and sends nothing.
-- SMS rows are sent only with CASL consent when the live flag is on.
alter table profiles add column if not exists gov_province text;
update profiles p set gov_province = upper(o.province)
from government_members m join government_orgs o on o.id = m.org_id
where p.user_id = m.user_id and m.status = 'active' and (p.gov_province is null or btrim(p.gov_province) = '');
create table if not exists gov_broadcasts (
  id text primary key,
  province text not null,
  audience_kind text not null,
  body text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists gov_broadcast_deliveries (
  id text primary key,
  broadcast_id text not null,
  channel text not null,
  status text not null,
  target_kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists gov_broadcasts_province_idx on gov_broadcasts (province, created_at desc);
