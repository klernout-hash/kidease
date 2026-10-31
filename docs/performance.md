# Performance and on-call

| Flag | Default | What it does |
| --- | --- | --- |
| `FEATURE_CITY_SEARCH_KEY` | off | City hub queries use the indexed `city_search_key` column. Montreal and other large cities skip the per-row translate. Migration 0127 fills the column either way. |
| `FEATURE_OFFLINE_CACHE` | off | The Capacitor app may store the last search (name, city, slug). No photos. The website does not write it. Nothing is submitted to an app store. |
| `FEATURE_ONCALL_HOOK` | off | `POST /api/on-call` may POST `{ text }` to `ONCALL_WEBHOOK_URL` when health is not ok. No database URL. This is separate from Sentry and from the automation pack's error alerts. |

The public status page is unchanged.

## GHL

Do not send on-call pages through GoHighLevel.
