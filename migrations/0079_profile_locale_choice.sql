-- profiles.locale defaults to en for every account, so that default is not a saved choice.
-- locale_chosen is set only when the person picks a language.
alter table profiles add column if not exists locale_chosen boolean not null default false;
