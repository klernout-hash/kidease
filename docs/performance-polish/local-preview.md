# Reproduce a safe local measurement

Use a new clone of the verified source revision, with no `.env` or `.env.*` files other than `.env.example`. Do not run these commands in a production-configured checkout. Clearing the process environment does not prevent Vite from loading a local environment file.

Install the lockfile dependencies, then build without the application's migration or source-map-upload steps:

```sh
npm ci --ignore-scripts
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production npx vite build
node scripts/check-ssr-bundle.mjs
node scripts/check-locale-chunks.mjs
node scripts/check-client-db.mjs
```

The Vercel-preset preview needs the embedded database runtime next to its server bundle. Copy these package files into this clone's ignored build output:

```sh
cp node_modules/@electric-sql/pglite/dist/pglite.data .vercel/output/functions/__server.func/
cp node_modules/@electric-sql/pglite/dist/pglite.wasm .vercel/output/functions/__server.func/
cp node_modules/@electric-sql/pglite/dist/initdb.wasm .vercel/output/functions/__server.func/
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production E2E_ROLE_FIXTURE=1 SUBSCRIPTIONS_ENABLED=0 SHOW_PAY_CTAS=0 npm run preview -- --port 8081
```

No database URL or delivery/payment provider credentials are supplied. This selects disposable in-memory PGLite. The subscription flags are off; they do not change parent-to-daycare invoice/payment code. No real payment can be verified without credentials, and these checks never charge, send messages or submit product forms.

In a second shell, run the audit commands from [README.md](README.md), with the exact served SHA supplied as `--revision`. Use the verified local listing slug `provincial-employee-day-care-portage-1255` for the recorded source, or verify a current local catalog slug first. Keep baseline and changed builds in separate clones/build directories; never rebuild a directory while a browser is using its hashed assets.

Run performance timing serially on a quiet host for a controlled rerun. The delivered exploratory timing set used isolated database processes but shared a Mac with layout workers and Node checks; that host contention is retained as a limitation. Use a fresh browser profile for each navigation and record server warm/cold state, exact viewport, CPU/network simulation, external request blocks and per-sample ranges. Layout and physical-device testing are separate work.

The repository phone smoke shard can run against the existing local server without the default runner's subscription overrides or health probe:

```sh
BASE_URL=http://127.0.0.1:8081 npm run e2e -- --shard 4/8 --out-dir artifacts/performance-polish/repo-smoke
```

This is only shard 4/8. The ordinary public smoke shard probes `/api/health`, and `--start-preview` enables subscriptions in its fixture process, so neither was used for the recorded local phone smoke.
