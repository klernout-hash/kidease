# Iteration-3 controlled collection

Use only the coordinator-approved direct loopback servers and canonical fixture
manifest described in [fixtures.md](fixtures.md). Earlier iterations remain
unchanged and are not combined into this causal before/after comparison: their
fixture state, warmup user-agent pairing and preparation protocol differed.

The baseline is the immutable `6595cc431342c453427043cc28ed72ffc9147c73`
build (runtime equivalent to `865e4710`). The after source must be the exact
frozen build recorded in the selected manifest phase. Do not infer a served
source from the current, potentially modified working tree.

## Input checks without a browser

```sh
node scripts/polish-controlled-lighthouse.mjs \
  --phase before --base http://127.0.0.1:8091 \
  --source-sha 6595cc431342c453427043cc28ed72ffc9147c73 \
  --fixture-manifest ../evidence/iteration-3/fixtures/fixture-manifest.json \
  --html-encoding identity --validate-protocol
```

The startup collector accepts the same validation arguments. Both require the
selected phase's source, origin, imported archive SHA, initial full-table hash,
canonical content hash, exact stored surfaces and captured state-file hashes
to agree. An absent, changed or failed proof blocks collection. Validation
does not start Chrome, make an HTTP request, seed data or refresh auth sessions.
Private archive, auth keys and role-state files must stay outside evidence
packages and Library uploads; reports contain hashes rather than cookie values.

## Quiet collection

Only the coordinator can open the quiet window. Other agent browsers, builds,
tests and uploads stop until every measurement browser closes. Existing user
browsers are not closed or inspected. Sanitized boundary process observations
are limited snapshots, not continuous proof of an otherwise idle host.

```sh
node scripts/polish-controlled-lighthouse.mjs \
  --phase before --base http://127.0.0.1:8091 \
  --source-sha 6595cc431342c453427043cc28ed72ffc9147c73 \
  --fixture-manifest ../evidence/iteration-3/fixtures/fixture-manifest.json \
  --html-encoding identity --pages home,search --runs 3

node scripts/polish-controlled-startup.mjs \
  --phase before --base http://127.0.0.1:8091 \
  --source-sha 6595cc431342c453427043cc28ed72ffc9147c73 \
  --fixture-manifest ../evidence/iteration-3/fixtures/fixture-manifest.json \
  --html-encoding identity --pages home,search
```

Repeat for the verified `after` source on port8092 with `--phase after` and
`--html-encoding gzip`. This uses direct application servers. Identity before
versus gzip after is the application transport change under evaluation; no QA
proxy standardizes or rewrites it. Both phases use the identical explicit
`Accept-Encoding: gzip, deflate, br`. Content encoding, encoded length/transfer
size and decoded body bytes remain separate. Encoding mismatches block timing
acceptance rather than silently changing the request protocol.

Each Lighthouse navigation gets a fresh Chrome profile. Actual Chrome version
comes from `Browser.getVersion`; its reduced version defines one explicit
mobile user-agent used for both the sole document warmup and Lighthouse's
navigation. The actual document headers and Lighthouse network user-agent must
match. No browser asset cache is warmed. Captured role state is loaded without
per-navigation seeding or a separate `get-session` request. An independent
settled-content probe records the complete visible surface; search total and
ordered card identities/text must match the canonical proof. Original SSR
facts and actual Lighthouse final frames remain distinct evidence.

Lighthouse uses its simulated mobile412×823/DPR1.75, Slow4G150ms RTT and
1638.4Kbit/s throughput, CPU4× settings. It is not a physical phone/network.
Unique loaded same-origin script bodies are compressed with gzip9 for a lower
bound on the script budget; inline scripts remain excluded. TBT is not INP.

Guest search captures retain sanitized matching Trace/DevtoolsLog and other
Lantern inputs. Models are recomputed from full raw inputs in memory only
after the measured browser closes and its final host snapshot is recorded.
The model output records optimistic/pessimistic graphs, node timings, terminal
dependency paths and agreement with the original Lighthouse LCP/FCP. Header
values are limited to safe transport/cache/UA fields; cookies, credentials,
payloads and URL queries are omitted. A model mismatch stays explicit and does
not alter an already captured Lighthouse value.

Startup diagnostics use desktop1280×800 with the actual desktop user-agent
identical in the warmup and navigation, applied CDP CPU4× and adjusted Slow4G
latency562.5ms/download1474.56Kbit/s/upload675Kbit/s. The first existing-header
Menu click is no earlier than DCL+1second. Its first result is saved before any
diagnostic second activation. Handler attachment is observed in100ms samples
to absolute navigation+30seconds; first failure remains a failure. A second
click is attempted only after a handler is observed, with its time/outcome
separate. Actual first click, handler detection, first successful opening and
settled content are separate fields. This is not whole-app hydration proof or
field INP; missing EventTiming entries are unobserved, not zero.

Collectors refuse to overwrite an existing phase. Preserve failures and do not
retry until fast or repair fixture data. If visible state changes, stop and
follow the fixture owner's independent snapshot/reverification procedure.
After each phase, record post-navigation table fingerprints/content parity
again. HTTP GETs may write session, idle or ranking metadata; do not assume
they are read-only. External browser requests, `/api/health` and the seed route
are blocked. No production data, live account, payment or messaging action is
part of this protocol. Subscriptions remain off; payment settings are unchanged.
