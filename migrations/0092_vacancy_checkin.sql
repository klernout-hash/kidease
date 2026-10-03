-- Weekly open-spot total from a signed link. Does not guess an age group.

alter table daycares add column if not exists open_spots_confirmed int;
alter table daycares add column if not exists open_spots_confirmed_plus boolean not null default false;
