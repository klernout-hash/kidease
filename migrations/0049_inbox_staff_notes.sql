-- Private staff notes on centre inbox threads. Never sent to the parent.
alter table conversations add column if not exists staff_note text;
