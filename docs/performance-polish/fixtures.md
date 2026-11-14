# Identical disposable fixtures

This QA-only protocol does not change application database/API code. It uses the existing `globalThis.__pgliteInstance__` and installed PGlite archive API. Never load it in a production/deployed process. No database URL, deployment environment, delivery credentials or Stripe credentials are accepted. Subscription flags remain off; payment settings are unchanged.

The old iteration1/2 reports remain immutable. They did not prove identical fixture state. This protocol creates new evidence only.

## Private preparation

Use a clean isolated build without `.env` files. Create a **mode0700** directory outside any evidence/package selection, and a separate public report directory. Socket paths must be shorter than100bytes.

```sh
mkdir -m 700 /tmp/kidease-polish-fixture
mkdir -p artifacts/performance-polish/iteration-3-fixture
```

Start the verified baseline build using **direct Node**, so the import hook and application share one process. Run from the immutable build's checkout, substituting the full verified SHA and the current QA helper's absolute path:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production \
  E2E_ROLE_FIXTURE=1 SUBSCRIPTIONS_ENABLED=0 SHOW_PAY_CTAS=0 \
  POLISH_FIXTURE_DATABASE=local-pglite \
  POLISH_FIXTURE_PRIVATE_DIR=/tmp/kidease-polish-fixture \
  POLISH_FIXTURE_SOCKET=/tmp/kidease-polish-fixture/seed.sock \
  POLISH_FIXTURE_AUTH_FILE=/tmp/kidease-polish-fixture/auth.key \
  POLISH_FIXTURE_REVISION=FULL_VERIFIED_SOURCE_SHA \
  node --import /absolute/current-checkout/scripts/polish-fixture-preload.mjs \
  node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 8091
```

The normal app initializes its own fresh in-memory database. Warm `/` once to initialize it; do not request `/api/health`, `/status` or `/fr/status`. The fixture browser guard blocks those paths after decoding/normalizing them, plus all external HTTP/WebSocket requests. Then, only when the coordinator authorizes browser work, prepare the fixture from the current QA checkout:

```sh
env -i PATH="$PATH" HOME="$HOME" \
  E2E_ROLE_FIXTURE=1 SUBSCRIPTIONS_ENABLED=0 SHOW_PAY_CTAS=0 \
  POLISH_FIXTURE_DATABASE=local-pglite \
  node scripts/polish-fixture-prepare.mjs --action prepare \
  --base http://127.0.0.1:8091 \
  --socket /tmp/kidease-polish-fixture/seed.sock \
  --private-dir /tmp/kidease-polish-fixture \
  --revision FULL_VERIFIED_SOURCE_SHA \
  --out artifacts/performance-polish/iteration-3-fixture \
  --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

The seed order is exactly parent, provider, admin, once each. All use `paid:false`, `activity:true`, `attention:true`; provider ownership is `e2e-attention-centre`. This uses the existing authorized loopback fixture API. It intentionally settles all three roles before any measurement, so later provider seeding cannot change a previously measured search total or parent request state. The helper saves synthetic role cookies privately, warms and settles EN/FR search and all three functional desk homes serially, and records actual content. It exports only after all browser contexts close.

Public outputs include a canonical-content report and `fixture-manifest.json`. The manifest contains the archive SHA256, every table's row count/hash, and state-file hashes. It contains no cookie/key/row values from auth tables. Private role states, `auth.key` and the mode0400 `canonical-pglite.tgz` must never enter logs, Library uploads, evidence ZIPs or commits. Do not print them. A preparation-start marker prevents retrying a partially completed seed sequence; use a new disposable process/directory after a failed preparation.

## Import identical bytes

Stop the seed process. Start each before/after process with the same auth key and archive. The additional environment variables are:

```text
POLISH_FIXTURE_IMPORT=/tmp/kidease-polish-fixture/canonical-pglite.tgz
POLISH_FIXTURE_IMPORT_SHA=<snapshot.sha256 from the public manifest>
```

Use a distinct socket and port for each process and the actual served source SHA. The import validates archive bytes, recreates a separate memory database, hashes **every original row**, and shares the original private auth secret. Imported measurement servers return409 for the seed route. They do not reseed on navigation.

Before measuring, verify each phase with the same helper and original private state files:

```sh
env -i PATH="$PATH" HOME="$HOME" \
  E2E_ROLE_FIXTURE=1 SUBSCRIPTIONS_ENABLED=0 SHOW_PAY_CTAS=0 \
  POLISH_FIXTURE_DATABASE=local-pglite \
  node scripts/polish-fixture-prepare.mjs --action verify --phase before \
  --base http://127.0.0.1:8091 \
  --socket /tmp/kidease-polish-fixture/before.sock \
  --private-dir /tmp/kidease-polish-fixture \
  --revision FULL_VERIFIED_SOURCE_SHA \
  --out artifacts/performance-polish/iteration-3-fixture \
  --chrome '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

Repeat for `after`, with its own base/socket/revision. Verification never calls the seed API. It requires the same archive SHA and complete initial table hashes; then it compares search total, all rendered96card identities **in order and with their text**, ordered parent saved/request rows, full provider desk content/centre links, and admin counts/queue rows. A different count or card produces `fullContentParity:false` and blocks benchmarks. A heading, HTTP200 or the same96slug set alone is insufficient.

`content-proof.json` is phase-aware. A before/after comparison requires the same canonical-content hash and archive SHA for both phases. The metrics collector consumes `roles.*.storageStateFile` without seeding and verifies each private file's `storageStateSha256`.

## Clock validity and a fresh generation

Identical archive bytes do not prevent a captured admin session from expiring. The first iteration3archive was over40minutes old when after verification reached the app's unchanged30minute admin-idle guard. That attempt correctly failed with an explicit session-timeout error. Keep that archive, its earlier before proof and the failed after diagnostic unchanged.

New manifests record `validity.adminIdleExpiresAt` and `adminIdleExpiresEpochMs`, read from the existing captured cookie; no private value is included. `assertFixtureValidity(manifest)` rejects an expired, missing or inconsistent deadline. Verification also checks that the private state bytes and their original expiry still match, before starting its browser, and checks the deadline again before certifying its result. It never renews cookies, changes the application TTL or patches database timestamps. Metrics must use this same import-safe assertion before each measured navigation, not only at collector startup.

Wait until both runtime builds, collectors and helper hashes are frozen. A coordinator-approved new generation uses a **new** mode0700 private directory and a **new** public output directory, for example `evidence/iteration-3/fixtures-generation2`. Do not reuse or remove the old private directory. The lifecycle is:

1. Coordinator stops the old local servers and starts the frozen baseline as a fresh seed process, with a new socket/auth key and no import variables. Warm only `/` to initialize it.
2. Run `--action prepare` exactly once against that baseline. Preparation takes about30–60seconds; it seeds three roles, settles eight surfaces, closes the browser and exports the archive.
3. Coordinator stops the seed process and starts before/after measurement processes from the **same new archive bytes and auth key**, with distinct sockets. Both reject the seed route.
4. Run `--action verify --phase before`, then `--action verify --phase after`, each using the new private/public paths. Keep these commands **sequential** because they update one shared manifest. Allow about1–2minutes total. Each must match all261initial table fingerprints and all8canonical surfaces (including426search results/96ordered rendered cards and the two ordered parent request rows).
5. Confirm both `content-proof.json` phase entries are complete and matched, validate the captured expiry deadline, and close all preparation/verification browsers. Only then does the coordinator start the quiet timing window. Budget the complete timing and post-run checks to finish before the recorded deadline; the current bounded plan is13–20minutes in total.
6. Collect post-run fingerprints/content proof without reseeding. If expiry or visible-content drift occurs, retain the failed attempt and stop certification. A further generation requires coordinator authorization; it is never an automatic retry.

The exact commands are the preparation/import/verification commands above, substituting the new private/public generation paths and the frozen before/after source SHAs. Authentication secrets and state files remain outside evidence/package selection in every generation.

## Read-side mutations and repeatability

Authentication GETs may refresh session timestamps after10minutes; admin idle tracking and other application GETs may also write. The protocol hashes all tables before/after preparation and verification and records changed table names/counts/hashes, with no secret row output. These changes are evidence, not silently waived.

If navigation changes visible content, stop: restart an independent process from the immutable archive for that role/sample and reverify. Do not repair tables, delete records, reseed or relabel the result as matched. Keep each phase/role independent when collecting repeated causal samples. Record pre/post table fingerprints and visible-content parity again after the run. A loaded capture is not an error-free application certificate; page errors remain in the report.

Read-only control commands (the socket is mode0600) are available without a browser:

```sh
node scripts/polish-fixture-control.mjs --socket /tmp/kidease-polish-fixture/before.sock \
  --action fingerprint --out artifacts/performance-polish/iteration-3-fixture/before-post-run.json
```

Do not benchmark while preparation/verification browsers or other heavy work are running. The coordinator starts the quiet window explicitly.

## Tests

```sh
node --test scripts/polish-fixture.test.mjs
npx eslint scripts/polish-fixture-*.mjs
```

The seven tests export/import real isolated PGlite data, compare full rows across independent clones, prove mutation isolation, reject tampered archives and unsafe configuration, preserve cookie bytes during local-origin normalization, check expiry boundaries without renewing or exposing a cookie, and block normalized direct/indirect health paths. They do not start app servers, touch production databases or require a browser.
