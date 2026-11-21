# Child-photo authorization: local verification, 17 November 2026

This is a local source fix and synthetic verification. It does not establish a live exploit or a production fix. No publication, push, PR, merge, deployment, credential change, external send, real child photo, production access or live database was used.

## Source and isolation

- Authoritative local repository: `/Users/kylel/kidease`; its cached `origin/main` is `18b9a23b1f45cfe1c84a562fd6daebe04cdf53e3`. No remote refresh was performed.
- New isolated worktree: `/Users/kylel/Documents/Codex/2026-11-17/task-7/kidease-photo-authorization`.
- New local branch: `fix/curriculum-photo-authorization-nov17`, based on that cached `origin/main`.
- The authoritative checkout's existing iOS changes were left untouched. The inspected protection checkout at `d10d4d3c` has identical photo server/UI source to this baseline.
- Read `AGENTS.md` in the source and authoritative checkouts. No additional `AGENTS.md` or `.agents/skills` were found in the relevant repository paths. The explicit local-only instruction overrides the repository's general PR instruction.

At the baseline, `src/lib/server/curriculum-pack.ts:310–319` checked the supplied booking's centre and consent without binding it to the story's child. Lines 328–332 updated metadata without checking the affected rows. Lines 343–360 selected an arbitrary enrolled child/centre booking, accepted staff with access to any centre, and signed a supplied key without requiring it in the story's photo list or requiring publication. `src/components/curriculum-pack.tsx:383–406` used the first story while supplying the selected child's booking. These findings were independently verified from local source only.

## Result

- Uploads join the exact private story, matching metadata centre, exact enrolled booking and child's parent before storage. New private keys encode centre, child, booking and story.
- The metadata update repeats those checks, requires the original parent and consent timestamp and current staff access at the same centre, and requires exactly one returned story ID. Failure attempts storage cleanup and never returns success.
- Reads require the canonical key path, exact metadata key membership, matching story/metadata centre, published private story, bound enrolled booking and current valid consent. The actor must be the child's booking parent or current staff/owner of that exact centre. All these checks precede signing.
- The picker lists only the selected child's saved stories, requires a specific story, clears it when the child or centre changes, and selects the returned story ID after saving.
- Feature defaults and activation code are unchanged. No migration or dependency was added.

## Validation

Only explicitly named test files are allowed. Do not substitute `npm test`, a glob, a payment test, or the broad e2e smoke suite.

The final server allowlist command was:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" CI=1 \
  NODE_OPTIONS='--require=/tmp/kidease-photo-deny-network.cjs' \
  node --experimental-strip-types --test \
  scripts/curriculum-photo-authorization.test.mjs \
  scripts/curriculum-pack.test.mjs
```

Result: **78 passed, zero failed or skipped**, comprising 71 new handler boundary tests and seven existing curriculum tests. The new tests run actual handlers and SQL in a fresh in-memory PGlite schema with synthetic data and replacement storage edges. They reject network requests and payment-module imports. The test harness uses the three real membership-query functions extracted from source, avoiding unrelated billing imports; no payment or Stripe module or mock is executed.

Cases include cross-centre staff/owners, wrong story/child/booking/centre/key, mismatched parent ownership, non-array metadata, legacy/public/traversal keys, missing/unpublished/public stories, revoked or invalid consent, inactive enrolment, multiple competing bookings, storage failure, zero or failed metadata writes, lost write acknowledgements, cleanup failure, and changes to consent/enrolment/staff/relationships during storage. Positive parent, staff, owner and draft-upload cases are covered, including feature-off behavior.

The third and final allowlisted test file is the focused browser check:

```sh
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" CI=1 \
  node --experimental-strip-types --test scripts/curriculum-photo-picker.test.mjs
```

Result: **one passed, zero failed or skipped**, for **79 total passed tests** across the three named files. It verifies the selected child's story options, disabled file picker before story selection, exact selected-story and booking payloads, child/centre resets, and selection of the newly saved story. Browser requests are restricted to the synthetic loopback fixture; recorded external requests and page errors are both empty. The host required local loopback/Chrome execution permission. The fixture, browser and server were closed after the run.

Screenshots at [390px](../../artifacts/curriculum-photo-authorization/picker-390.png) and [1280px](../../artifacts/curriculum-photo-authorization/picker-1280.png) were visually inspected and show no horizontal overflow. They contain synthetic text and no real photos. The test log and structured evidence are `picker-tests.log` and `picker-evidence.json` in the same artifacts directory.

Other completed local checks:

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed, no diagnostics |
| `node node_modules/eslint/bin/eslint.js .` | Passed: zero errors, 141 existing warnings |
| ESLint on both changed source files and both new test files | Passed: zero errors or warnings |
| Direct `node node_modules/vite/bin/vite.js build` | Passed with sanitized environment and Node networking denied |
| `node scripts/check-ssr-bundle.mjs` | Passed: 71 server modules link cleanly |
| `node scripts/check-locale-chunks.mjs` | Passed: eight additional languages remain lazy |
| `node scripts/check-client-db.mjs` | Passed: 843 client files checked |
| `git diff --check` | Passed |

The build used an empty credential environment and a Node preload denying fetch, HTTP, sockets, TLS and DNS. Its retained copy is `artifacts/curriculum-photo-authorization/deny-network.cjs`. No `.env` file was copied into the worktree. Dependency packages were reused locally, with build caches isolated in this worktree. A first build attempt stopped on a shared Nitro-cache filesystem restriction; replacing that cache symlink with local cache space allowed the successful build. Build-generated route-tree changes were restored to the baseline.

`npm run build` was deliberately not invoked because it chains a sourcemap upload and configured database ledger check. The aggregate smoke suite contains payment mocks and was excluded. Focused component browser QA uses synthetic server data and synthetic non-image file bytes; it does not start the application or access a database.

## Limits

- Legacy keys lack booking/story provenance and now fail closed. No existing objects were inspected or migrated; recovering legacy access requires separately verified provenance.
- Previously issued signed links may remain valid for their 120-second lifetime after access or consent is revoked. New link issuance checks the current database snapshot.
- Storage and metadata are separate systems. Failed cleanup may leave an unbound private orphan. If a metadata commit succeeded but its acknowledgement was lost, the key may already be registered; normal reader authorization still applies. The synthetic tests cover this distinction rather than asserting a distributed rollback.
- Handler tests replace the framework/auth context and storage transport. They verify handler and SQL authorization, not a deployed HTTP boundary or real R2 behavior. The build targets the local Darwin ARM architecture.
- Feature activation and production behavior were not exercised or changed. No broad, payment, production or live-database tests were run.

Local validation logs and screenshots are kept under the ignored `artifacts/curriculum-photo-authorization/` directory.
