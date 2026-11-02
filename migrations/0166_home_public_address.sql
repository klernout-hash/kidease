-- Home daycare public-address opt-in.
-- Does not change, clear, or delete street, postal, or coordinates.
-- Default off: public pages hide the street until a verified owner opts in.

alter table daycares
  add column if not exists show_public_address boolean not null default false;

comment on column daycares.show_public_address is
  'When true, a verified owner has chosen to show this home daycare street on public pages. Centres are unaffected. Default false hides the street.';
