# Lifecycle notices

`FEATURE_LIFECYCLE` defaults **off**.

When it is on, `/notifications` shows email and SMS choices per category. Tips default off. SMS choices do nothing unless the parent has CASL SMS consent and `FEATURE_SMS` is on. Unsubscribe stops every category.

Win-back is email only, after 45 quiet days, and only with commercial email consent. It does not send SMS.

Age milestones are 12, 18, 30, and 72 months. The note says to search again. It does not say a spot opened.

Push is not built here.

## GHL

Win-back sequences belong in the CRM bot, not in a KidEase pipeline. Send only to contacts who already have CASL consent. Do not text a win-back.
