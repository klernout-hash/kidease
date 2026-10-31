# Home feed

`FEATURE_HOME_FEED` defaults **off**.

When it is on, a signed-in parent can save a city, province, child age in months, and a start date at `/for-you`. Ranking uses the city, the province, and the age only when the listing has confirmed ages. The start date is stored and does not create an opening.

"Parents near you also viewed" lists other listing ids in the same city after 5 distinct viewers. The public response has ids only. Viewer keys are hashes.

## GHL

Do not copy child age or start date into GoHighLevel from this feed. A CRM tag `kidease-feed-city` with the city name is enough if the parent opted into product email.
