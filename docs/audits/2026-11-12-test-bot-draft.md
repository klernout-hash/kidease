# Test Bot handoff draft for Kyle to send

Replacement draft: the original attached draft was not available. This text has not been sent to any bot.

Please retest KidEase’s current production build and record the exact evidence for each result.

- Project: **kidease-git**.
- Observed current production commit: **75cf0cd3cc1dc993b6eb920fe17139306f00cb80**, PR #840.
- Observed Ready production deployment: **CjfCG8SfQFaHifAKSKZh21pbfxMa**, current alias **www.kidease.ca**.
- Runtime flags: **last reported about 243 on, not reverified this run**. KIDEASE_CONNECT_LIVE was last reported **0** and was not changed. Stripe test-key presence remains unanswered and unverified. Do not activate Stripe or change flags.
- Clean look remains opt-in with `?look=clean`; classic stays the default.
- Huawei is live per Kyle. Its direct AppGallery URL still needs verification. Do not guess a listing URL.

Already observed live at both 390px and 1280px: Families navigation (D01) and removal of the pre-header parent/daycare placeholder stacks (P01/D02). The matcher parses `Toronto within 10 km` as Toronto/10 km at 1280px; its guided entry is absent in the 390px search UI, so phone acceptance remains not checked. These are bounded observations, not sign-off for entire desks.

Retest with existing, explicitly synthetic QA records only: X05 saved immunization → daycare approval and reload; P03 Quick replies fill an editable unsent draft; P05 completed tours never say booked; V08 towns/no-match feedback; V06 directory-summary download label. Kyle must perform any credential entry. Capture both widths and distinguish not checked from fail.

The new saved-map, attendance, government-cohort and wording changes are proposed in separate draft PRs. They are not part of the production revision above. Record their actual PR commit IDs and CI status before testing any later released revision. Local fixtures and local passing tests are not live results.

Do not use production `/api/health` or HEAD as a read-only probe: the current handler runs an age backfill. `/api/on-call` has the same side effect. Verify deployment revision through Vercel metadata; database health remains not checked unless a genuinely read-only probe is available. Do not trigger previews with an unverified production database: builds run migrations. New `cursor/*` branches are currently skipped by the actual project ignored-build command.

Still waiting on Kyle’s choices: D03 court order; G01 hide/label unconfirmed fees; V06 build/leave exports; Stripe test keys yes/no. Skip blank answers. Email Bot and CRM Bot stay paused; do not contact them. Do not touch PRs 357, 336, 307, 289 or 841, bypass protection, or pay. Release only after required checks and release clearance; return the exact readiness and live results to Kyle.
