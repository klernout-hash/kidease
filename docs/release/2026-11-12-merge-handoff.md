# Merge handoff, 12 Nov 2026

Written so another account can merge the open pull requests. Required GitHub checks are `check` and `e2e`. A Vercel preview skipped by the ignore step is not a blocker. Do not merge a pull request that is behind `main` or has a failing required check. After each merge, wait until the production deployment for that commit is READY on kidease.ca before merging the next one that touches the same files.

No flags were turned on while this note was written.

## Already merged

| PR | Title | Merge commit | Merged at (UTC) | Production |
| --- | --- | --- | --- | --- |
| 835 | Show which KidEase app stores are open | `a1927f281c1e64cddd570db9fa514f7b27db505d` | 2026-11-11 17:14:07 | READY, aliased to kidease.ca |
| 838 | Put parent desk sections in one menu | `5a131dc69ff6329383528765a66bc7b93f5fc842` | 2026-11-11 17:41:15 | READY, then replaced by later merges |
| 834 | Fix the signed-out guest gaps from the 11 Nov audit | `d451899ee7dd8d367154e7d0dd82c5b79e699186` | 2026-11-11 21:10:14 | READY, then replaced by 822 |
| 822 | Add Phase 3 rules and the allowed Phase 4 items | `38b8ba931ae4ad990ee9d8d7b6a0c0f1073dd3e6` | 2026-11-11 21:58:28 | Deployment `dpl_F12K8JYtwpNUjayJGCzhgT3aM5y6` READY on kidease.ca |

## Merge order

Merge only when that row's required checks are green and the branch is up to date with `main`.

| Order | PR | Title | Head at handoff | Base | Depends on | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 824 | Add Phase 5 centre tools behind off flags | `31bafd0d55` | main | 822, already in this head | Checks were running. Flags stay off. |
| 2 | 825 | Add Phase 6 custody, reports, and extra days behind off flags | `d56c3594` | main | 822, merged in | Flag-list conflict resolved. All new flags off. |
| 3 | 826 | Fix four admin desk display faults | `543f97f0` | main | none | Updated onto 822. Display only. |
| 4 | 827 | Stop the home category row overlapping the signed-out header buttons | `adec3ec7` | main | none, after 826 if both touch the header | Updated onto 822. |
| 5 | 828 | Route QA payments to Stripe test keys | `9048303e` | main | none | Does not turn live Stripe on. |
| 6 | 829 | Pass the 3% KidEase fee to the parent | `5fa3d801` | main | none | Fee is calculated. No live charge. |
| 7 | 830 | Show the support case when its URL opens | `1b17f2cc` | main | none | Signed-in menu fix is in this head. Re-check `signed-in-e2e`. |
| 8 | 832 | Add the daycare lead pipeline | `2e7eb602` | main | none | Pipeline flags stay off. No family mail. |
| 9 | 833 | Add the KidEase signup path into GoHighLevel | `6732563b` | main | none | Approved to merge. Do not set the GHL flags. |
| 10 | 831 | Rebuild the government desk as five pages | `e24a08ff` | main | none | Old gov URLs now sign in before redirect. |
| 11 | 836 | Show what the government desk can prove | `3acd0716` | `cursor/gov-desk-simple-7aa9` | 831 merged to main first | Then merge 836. `FEATURE_GOV_OVERSIGHT` stays off. |

Heads move when a new commit is pushed. Read the PR head before merging.

## What failed, and what was fixed

Desktop visual and the short e2e gate failed together because GitHub runners could not resolve `archive.ubuntu.com` while installing Playwright. The e2e job then stopped in a few seconds because the visual job had failed. `.github/workflows/ci.yml` on these branches now uses public DNS when that mirror does not resolve.

829's `check` failure was two untranslated lines, "Centre bill" and "You pay". They are in the other eight languages.

830's `signed-in-e2e` failed because a phone-width reload left the header Menu button hidden. Sign-out now uses a wide page and reloads if that button is still hidden.

831 and 836 `check` failed because tests still expected the old six-card government desk, and old government URLs redirected without the sign-in guard. The overview keeps three public counts, the job shortage stays behind its flag, and the old URLs call `guardGovDesk` before redirecting.

## After each merge

1. Wait until the Vercel production deployment for that merge commit is READY and aliased to kidease.ca and www.kidease.ca.
2. Do not turn flags on as part of the merge.

### Migrations

- `migrations/0201_privacy_requests.sql` is already on `main`. Confirm `schema_migrations` before applying anything new. Do not print the database URL.
- `migrations/0202_ghl_lead_push.sql` is only on PR 833. Apply it after 833 merges, and only if that version is not already recorded.
- The daycare pipeline migration is only on PR 832. Some CRM columns were added on production outside the migration table. Apply the file only for objects that are not already there. Do not send mail or text while applying it.

### Flags that stay OFF

- Live Stripe (`KIDEASE_CONNECT_LIVE` stays `0`).
- Subscriptions and in-app purchases.
- DocuSign envelopes.
- Customer email or SMS beyond the existing allowlist.
- Publishing QA centres.
- Manitoba-agreement government features (`FEATURE_GOV_OVERSIGHT` stays unset or `0`).
- GoHighLevel push (`FEATURE_GHL_LEAD_PUSH` and `FEATURE_GHL_LINE_TYPE` stay unset or not `1`). The CRM Bot stays paused.
- Daycare pipeline sends and workflows stay off.

New flags in 822, 824, and 825 ship default off. Leave them off until a separate decision. None of them should send or charge while off.

## Production checks

- https://www.kidease.ca/get-app shows Google Play and Amazon Appstore as download links. Huawei AppGallery, the App Store, Galaxy Store, and Microsoft Store say Coming soon and have no link. There is no public AppGallery app id in the repo.
- https://kidease.ca/app opens the store list on a desktop browser. An Android visit redirects to the Play listing.
- https://www.kidease.ca/menu signed out shows one sign-in card, not the parent rows for pay, documents, or health.
- A signed-in parent on /parent sees Learning stories under My family and child health on the Children tab. Phone Menu includes Pay, Documents, Tour calendar, Share family, From your daycare, and Search alerts.
- A phone listing has one main button and the heart. The availability line is in the page, not in the bar.
- Phase 3, 5, and 6 screens stay hidden while their flags are off.
- Support: open `/support/sc_e2e` only in the e2e fixture. A real case URL should render the case, not a blank desk.
- Government desk stays behind the existing gov sign-in. Oversight numbers that need a provincial agreement say they are not connected.
