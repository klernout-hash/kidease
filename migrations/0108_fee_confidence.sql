-- How a monthly fee was set. Null keeps the old rule:
-- a live centre's amount reads as confirmed, a catalogue amount reads as a provincial estimate.
-- 'centre' is typed by the centre. 'estimate' is a public backfill.
-- This does not delete or rewrite fee amounts.

alter table daycares add column if not exists fee_confidence text;
