-- Operator can take a listing off the site without wiping the claim.
alter table daycares add column if not exists listing_active int not null default 1;
alter table daycares add column if not exists pause_code text;
alter table daycares add column if not exists pause_reason text;
alter table daycares add column if not exists paused_at timestamptz;
alter table daycares add column if not exists paused_by text;

create index if not exists daycares_listing_active_idx on daycares (listing_active);
