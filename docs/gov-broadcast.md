# Emergency notices

`FEATURE_GOV_BROADCAST` defaults off. A government user or an admin can prepare a notice for a province, city, or postal area (FSA). Practice mode counts who would get it and sends nothing. `FEATURE_GOV_BROADCAST_LIVE=1` sends email. A text goes only to a parent with CASL SMS consent.

A government user can reach only `gov_province`. Demo government accounts stay read only. No child names are stored on the delivery rows.

Pages: `/gov/broadcasts`, `/admin-gov-broadcasts`.
