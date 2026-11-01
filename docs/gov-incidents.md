# Serious occurrences

`FEATURE_INCIDENTS` defaults off. Turn it on to open the daycare form, the parent note, and the province inbox. Nothing is emailed or texted until `FEATURE_INCIDENTS_LIVE=1`.

Texts also need a stored CASL SMS opt-in and `FEATURE_SMS`. Practice mode writes a log line with ids only.

Ontario's filing clock is 24 hours (O. Reg. 137/15, s. 38(1)(b)). Other provinces use a 24-hour placeholder until their rule is confirmed.

A government account sees only `profiles.gov_province` (filled from the government org when that column is empty). Counts do not include a child's name. The filed report for that province can include the child label the daycare typed, because the province filing needs it.

Pages: `/centre-incidents`, `/family-incidents`, `/gov/incidents`, `/admin-gov-incidents`. The government and admin pages stay on the website.
