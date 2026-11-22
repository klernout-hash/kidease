# KidEase

KidEase (kidease.ca) is a Canadian daycare directory. Parents search licensed daycares, compare them, and ask for a tour. Daycare owners claim a listing and use a desk for messages, tours, and billing. There is also an admin desk.

The site is English and French. The phone apps are not in the stores yet.

## Setup

You need Node.js 22 or newer.

```bash
npm ci
npm run dev
```

The dev server listens on port 8080. With no database URL, local development uses an embedded Postgres (PGLite). A Neon URL uses Neon instead.

```bash
npm run build
npm run preview
```

## Scripts

| Script                     | What it does                                                |
| -------------------------- | ----------------------------------------------------------- |
| `npm run dev`              | Start the Vite dev server                                   |
| `npm run build`            | Production build, then the bundle and migration checks      |
| `npm run preview`          | Serve the production build                                  |
| `npm test`                 | Unit tests                                                  |
| `npm run typecheck`        | TypeScript                                                  |
| `npm run lint`             | ESLint                                                      |
| `npm run format`           | Prettier write                                              |
| `npm run e2e`              | Browser smoke. Needs `BASE_URL` or `npm run e2e:preview`    |
| `npm run db:migrate`       | Apply SQL migrations. This writes to the database           |
| `npm run db:migrate:check` | Read-only check that the migration ledger matches the files |

## Architecture

TanStack Start (Vite + Nitro), not Next.js. File routes live in `src/routes`. Shared UI is in `src/components`. Server functions and database access are in `src/lib/server`. SQL migrations are in `migrations`. The production host is Vercel, behind Cloudflare. Postgres is Neon. Photos are on Cloudflare R2. Sign-in is Better Auth.

Parent, daycare, and admin areas have separate navigation.

## Environment variables

Names only. Do not commit values. The full name list is in `.env.example`. Set secrets in the host, not in git.

Boot names:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`

Payment names, when you are working on billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Feature flags are `FEATURE_*` names in `.env.example`. They default off in code unless that file says otherwise. Do not turn on production flags from a branch.

## Tests in CI

GitHub Actions runs typecheck, lint, unit tests, a production build, and the browser smoke. See `.github/workflows/ci.yml`.
