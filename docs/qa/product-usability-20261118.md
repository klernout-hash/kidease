# Product usability — November18,2026

Separate branch `fix/product-usability-nov18`, based on the preserved UI candidate `5fea21007b44613c7caa02e2b9aded49b8a5a623`. This is ordinary product work, not continuation of the stopped capability/security QA.

## Changes

Saved shifts now offer Edit, Save changes and Cancel in English and French. The existing save endpoint accepts an optional saved ID and updates that row in its existing centre context. A missing saved row returns a localized failure rather than inserting a replacement. The existing authorization, feature gate, screening flow and schema stay in place. Cancel leaves the saved row unchanged; invalid/rejected saves retain the form. Untouched time controls preserve their original instant/precision; changed controls follow the browser-local convention already used by the displayed label.

Occupancy exports the already-loaded report through a secondary CSV button. It contains seven visible columns, current row order, displayed missing-value explanations and the supplied visible summaries. It reuses the existing CSV serializer with UTF-8 BOM, quoted comma/newline cells and doubled quotes. It omits IDs, hidden capacity/enrollment totals, child records and financial fields. Downloading performs no new read, selection or API request.

Expiry feedback required no source change: the current EN/FR scheduling copy says reminders are off. The `sendEceExpiryReminders` endpoint returns `sent:0` and has no UI caller/send button in this tree; certificate-save feedback makes no email claim. No delivery action was connected.

## Validation boundary

Focused unit files: `scripts/staff-shift-edit.test.mjs` (actual save handler extracted with positive synthetic gates and record-only SQL), and `scripts/org-occupancy-csv.test.mjs` (literal CSV expectations). This is not physical PostgreSQL or deployed authorization evidence.

Actual component browser files: `scripts/staff-shift-edit.browser.mjs` and `scripts/org-occupancy-export.browser.mjs`. They use synthetic existing rows/aggregates, closed service boundaries and this checkout's compiled CSS. Required acceptance is same-ID edit/save, unchanged Cancel, input retained on validation/failure, correct CSV headers/escaping/visible totals, EN/FR390/1280, keyboard focus and44px controls. Exact command/results/screenshots are retained under `artifacts/product-usability`, `artifacts/staff-shift-edit` and `artifacts/org-occupancy-export` after validation.

Both browser files are additional required first-shard CI steps after the restored build. Existing admin/parent checks and all prior CI gates remain. Local checks use explicit nonpayment allowlists; aggregate payment suites are not run locally.

## Release limits

This branch is separate from the validated UI candidate and PR942. It needs exact-head CI and the existing schema/visual gates before central integration or deployment. No production/database/ledger access, migrations, real messages/payments or feature activation occurred. Native calendar controls and concurrent-edit conflict policy are not newly established by these fixtures.

Standing holds remain: KidEase app subscriptionsOFF, EmailBotPAUSED, CRMBotPAUSED. Current runtime states are unknown. Parent-to-daycare payments are distinct. DSR, child/custody, messaging, QR and privacy candidates remain outside this branch; the latest privacy follow-up is awaiting its own review and release gates.
