/**
 * Inngest serve endpoint for TanStack Start on Vercel.
 *
 * This is not a Next.js `app/api/inngest/route.ts`. KidEase uses
 * `createFileRoute` + `inngest/edge` (Web Request/Response), per
 * https://www.inngest.com/docs/learn/serving-inngest-functions
 *
 * Ops (Kyle):
 * 1. Create an Inngest Cloud account and app (id `kidease`).
 * 2. Copy Event Key → Vercel project **kidease-git** env `INNGEST_EVENT_KEY`
 *    (Production + Preview). Copy Signing Key → `INNGEST_SIGNING_KEY`.
 *    Or install the Inngest Vercel integration, which sets both.
 * 3. Sync URL: https://www.kidease.ca/api/inngest (Production).
 *    Preview: the deployment URL + `/api/inngest`.
 * 4. Optional: `INNGEST_SERVE_ORIGIN=https://www.kidease.ca` so Cloud
 *    syncs the custom domain instead of a *.vercel.app URL.
 * 5. If Preview has Deployment Protection, add Vercel’s Protection Bypass
 *    for Automation in the Inngest Vercel integration.
 *
 * The app boots when keys are missing. This route still answers; Cloud
 * cannot sync until both keys are set. FEATURE_PUSH and FEATURE_SMS stay off.
 */
import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { functions } from "@/inngest/functions";
import { inngest } from "@/inngest/client";

const handler = serve({
  client: inngest,
  functions,
});

async function run(request: Request) {
  try {
    return await handler(request);
  } catch (err) {
    console.error("[kidease-inngest] serve failed", err);
    return Response.json({ ok: false, error: "inngest serve failed" }, { status: 503 });
  }
}

export const Route = createFileRoute("/api/inngest")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
      PUT: ({ request }) => run(request),
    },
  },
});
