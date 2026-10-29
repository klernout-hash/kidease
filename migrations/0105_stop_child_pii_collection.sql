-- PIPEDA and Quebec Law 25 (2026-10).
-- KidEase stopped collecting a child's first name on the daycare waitlist.
-- New waitlist rows leave child_label null and keep the age group only.
-- Parent and guest screens no longer collect or show child profiles:
-- name, birthdate, health, allergies, immunization, medicines, or a journal.
-- This file does not DROP tables, columns, or rows.
-- children, family_documents, daily_journals, care_medications, and
-- daycare_waitlist stay so existing rows are not destroyed.

comment on column daycare_waitlist.child_label is
  'Retired 2026-10. New waitlist rows store null. Age group only. Do not drop.';

comment on table children is
  'Retired for new collection 2026-10. The app does not add or show child profiles. Do not drop.';
