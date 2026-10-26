# Guardrails Kyle still turns on

This pull request adds the checks. It does not change GitHub branch protection, Vercel project settings, or any paid product.

## Signed-in tests

GitHub Actions job `signed-in-e2e` (`.github/workflows/ci.yml`) builds the preview and signs in as the loopback parent and daycare fixtures. It checks English and French: login, still signed in after reload, `/parent` or `/provider`, messages, and Save details.

To make that job block a merge:

1. Open the repo on GitHub → Settings → Branches → the `main` rule.
2. Enable “Require status checks to pass”.
3. Add the check named `signed-in-e2e`.

Leave that box alone until you want it. This repo cannot flip it from a pull request.

## Live smoke and rollback

`.github/workflows/live-smoke.yml` runs after a GitHub `deployment_status` event whose environment is `Production` or `production`. It also runs from the Actions tab with “Run workflow”. It has a 2 minute limit. It only hits public pages on `https://www.kidease.ca` (`/`, `/login`, `/fr/login`, `/api/health`, `/sign-in`, `/sign-up`). It does not sign in on production.

If a check fails and these Actions secrets exist, the script calls Vercel’s instant rollback:

`POST /v1/projects/{projectId}/rollback/{deploymentId}`

([Vercel docs](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-previous-production-deployment-by-id))

It picks the previous READY production deployment, not the one that just failed.

Set these as repository Actions secrets when you want rollback. Until then a failed smoke stays red and does not call Vercel.

| Secret | What it is |
| --- | --- |
| `VERCEL_TOKEN` | A Vercel token that can roll back this project |
| `VERCEL_PROJECT_ID` | The project id (`prj_…`) |
| `VERCEL_ORG_ID` | The team id, only if the project is on a team |

The Vercel GitHub app must send deployment statuses, and the production environment name must be `Production` or `production`. This pull request does not change that connection.

## Alerts

No new paid monitor is added.

- `/api/health` is already public. `docs/uptime.md` describes an optional Better Stack heartbeat. Leave `BETTERSTACK_HEARTBEAT_URL` unset unless you already pay for that monitor.
- PostHog is already in the app. Turning on exception autocapture is a switch in the KidEase PostHog project. This pull request does not flip it.
- Vercel’s own alerts, if they need a paid add-on, stay off.

## Left for you

Payee and fee wording stays as it is. The claim approval that emails `kyle@kidease.ca` is not in this pull request. Plans stay hidden until `SUBSCRIPTIONS_ENABLED` is on, and store apps still hide plans when that flag is on.
