-- Manual waitlist order. FEATURE_WAITLIST_TOOLS stays off.
-- No fee. Sign-up order stays when rank_order is empty.

alter table daycare_waitlist add column if not exists rank_order int;

create index if not exists daycare_waitlist_rank_idx
  on daycare_waitlist (daycare_id, rank_order);
