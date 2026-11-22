drop table if exists background_check_records;

alter table daycares drop column if exists bg_check_policy_months;
alter table daycares drop column if exists bg_check_show_expiry;
alter table daycares drop column if exists bg_check_attest_at;
alter table daycares drop column if exists bg_check_attest;
