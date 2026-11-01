# Licensing complaints

`FEATURE_GOV_COMPLAINTS` defaults off. A parent sends a complaint without naming a child. It is routed to the listing province, or the province they pick. They get a tracking number.

The 10 business-day reminder is a placeholder, not a published provincial SLA. Practice mode logs the reminder. `FEATURE_GOV_COMPLAINTS_LIVE=1` can email the tracking number. A government user sees only `gov_province`.

Pages: `/family-complaints`, `/gov/complaints`, `/admin-gov-complaints`.
