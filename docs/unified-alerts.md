# Unified alerts

One list for parents, daycares, staff, and the web desk. It sits on top of the bell, the existing alert categories, and the existing email and phone-push senders.

`FEATURE_UNIFIED_ALERTS` and `FEATURE_UNIFIED_ALERTS_LIVE` default **off**. Preview and tests never send. Phone push uses the existing `FEATURE_PUSH` path only when that path is already armed. This does not turn on `FEATURE_CALL_PUSH`. There is no SMS.

A person can turn all alerts off, turn one type off, set quiet hours in their time zone (daylight saving follows the zone), and group email into a daily or weekly note. Critical alerts skip quiet hours. In-app rows still show up right away.

Safety blocks stop an alert between the two people, or about a blocked centre. Admin review of a report is not hidden by a block.

Home daycare alerts use the centre name only. A name that looks like a street is replaced with "Your centre".

## Overlap — do not rebuild

Open pull requests 706–710 are maps, phone layout, the listing editor, block-a-person, and the save check. This work does not change them.

Another branch is adding the child portfolio, co-parent linking, custody restrictions, and parent drop-off and pick-up reminders. Those are **hooks** here (`planPluginHook` / `emitPluginHook`). This branch does not create those records.

| Hook | Type | Who calls it |
| --- | --- | --- |
| `coparent_changed` | `parent_coparent_changed` | Co-parent branch |
| `dropoff_reminder` | `parent_dropoff_reminder` | Drop-off branch |
| `pickup_reminder` | `parent_pickup_reminder` | Pick-up branch |
| `portfolio_item` | `parent_portfolio_item` | Portfolio branch |
| `custody_restriction` | `staff_custody_notice` | Custody branch |
| `centre_closure` | `parent_centre_closure` | When a closure column exists |

Existing mail stays the sender for spot-opened, messages, licence or certificate expiry, and the weekly open-spot check-in. This list adds the in-app row and the new on/off switch. It does not send a second email for those.

## Pass / fail

Pass means the scan reads a real column and can record an in-app row when the flag is on. Partial means it works with the limit in the note. Fail means it is not sent.

| Alert | Result | Note |
| --- | --- | --- |
| `parent_spot_opened` | partial | In-app when a saved or waitlisted centre confirms spots. Email stays on the existing open-spot mailer. |
| `parent_request_accepted` | pass | Lead confirmed, tour accepted, or booking accepted. |
| `parent_request_declined` | pass | Lead, tour, or booking declined. |
| `parent_request_needs_info` | partial | There is no needs-info status. A note on an answered request is the signal. |
| `parent_tour_day` | partial | Day-before reminder only when the visit is booked on a tour window with a start time. |
| `parent_tour_hour` | partial | One-hour reminder only when the visit has a start time. |
| `parent_waitlist_position` | pass | Uses daycare waitlist rank or status. Does not invent a place. |
| `parent_new_message` | partial | In-app. The inbox already lists the thread. Email stays on the existing message mail. |
| `parent_centre_closure` | fail | No closure column, so nothing is scanned. Another feature can emit this hook when a centre marks a closure. |
| `parent_immunization_expiring` | partial | `family_documents.expires_on` was added. An alert fires only when that date is set. |
| `parent_allergy_plan_expiring` | partial | `children.allergy_plan_expires_on` was added. An alert fires only when that date is set. |
| `parent_coparent_changed` | fail | Co-parent linking is another branch. Hook only. |
| `parent_dropoff_reminder` | fail | Drop-off reminders are another branch. Hook only. |
| `parent_pickup_reminder` | fail | Pick-up reminders are another branch. Hook only. |
| `parent_portfolio_item` | fail | Child portfolio is another branch. Hook only. |
| `daycare_new_request` | partial | In-app for a new inquiry, tour, or enrolment. Existing request mail stays. |
| `daycare_request_unanswered` | pass | A request still in requested or pending after 24 hours. |
| `daycare_licence_expiring` | partial | Licence date, screening expiry, or first aid date. Existing document mail stays. |
| `daycare_weekly_spots` | partial | Weekly nudge when this week's open-spot check-in was not saved. Email stays on the existing check-in mail. |
| `daycare_new_review` | pass | A new row in reviews. The text of the review is not copied into the alert. |
| `daycare_new_message` | partial | In-app. Existing message mail stays. |
| `daycare_family_left` | pass | Waitlist withdrawn, or a tour the parent declined (`responded_by` is the parent). |
| `staff_shift_start` | partial | `staff_shifts.staff_user_id` was added. A reminder fires only when that login is set. |
| `staff_shift_end` | partial | Same link as shift start. |
| `staff_ratio` | pass | `ratio_checks` against `ratio_rules`. Over the limit is critical. Near is 85 percent. |
| `staff_child_not_arrived` | partial | Uses today's scheduled drop-off. No usual-time column exists. |
| `staff_child_still_here` | partial | Uses today's scheduled pick-up. |
| `staff_pickup_new` | pass | Fires when the parent already listed pickup people and the name is not on that list. |
| `staff_pickup_restricted` | fail | Custody restrictions are another branch. Hook only. |
| `staff_medication_time` | pass | `care_medications.schedule_times`. A log today counts as done. The medicine name stays off the alert. |
| `staff_allergy_clock` | fail | Allergy text exists. There is no allergy clock. Not sent. |
| `staff_room_checks` | fail | No nap, meal, or diaper due-check table. Not sent. |
| `staff_cert_expiring` | partial | ECE, staff credentials, and first aid. Existing certificate mail stays. |
| `staff_safety_check` | partial | Only centres that already log a maintenance or cleaning check. |
| `staff_incident_open` | pass | Serious incident not filed, or a care incident with no parent notice time. |
| `staff_incident_signature` | fail | No parent-signature column. Not sent. |
| `staff_custody_notice` | fail | Custody hook for a child in the room. Not built here. |
| `staff_director_note` | pass | `conversations.staff_note`. The note text is not copied into the alert. |
| `staff_schedule_change` | partial | A shift row created in the last day. There is no before/after diff. |
| `staff_shift_swap` | fail | No shift-swap table. Not sent. |
| `staff_new_child` | partial | Bookings store a start month, not a start day. Shown in the first 7 days of that month. |
| `admin_daily_digest` | pass | Operator only. New sign-ups. Web only. No government endorsement. |
| `admin_safety_report` | pass | Open safety reports. A government user sees a report only for their province. Web only. |
| `admin_safety_block` | partial | Blocks have no review status. This logs that a block was added. Web only. |

## Store flags

`SUBSCRIPTIONS_ENABLED`, `SHOW_PAY_CTAS`, in-app purchases, Sponsored, `FEATURE_PROVIDER_SUBSCRIPTIONS`, and `FEATURE_CALL_PUSH` are unchanged.
