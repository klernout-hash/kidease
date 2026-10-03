-- Founding member marker for claims made during the free founding period.
-- No end date and no discount percent. The badge flag can hide the label later.
-- Listing d_d85jtifbkh2t is left unchanged.

alter table daycares add column if not exists founding_member boolean not null default false;

comment on column daycares.founding_member is
  'True when the centre was claimed while paid plans were off. Honour a later discount. Do not store a percent or end date here.';

update daycares
set founding_member = true
where claimed_at is not null
  and id <> 'd_d85jtifbkh2t';
