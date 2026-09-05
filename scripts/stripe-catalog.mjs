#!/usr/bin/env node
/**
 * Bootstrap KidEase Stripe Products/Prices on the LIVE account.
 *
 * Usage (server env only — never commit the secret):
 *   STRIPE_SECRET_KEY=sk_live_… node --experimental-strip-types scripts/stripe-catalog.mjs
 *   STRIPE_SECRET_KEY=sk_live_… node --experimental-strip-types scripts/stripe-catalog.mjs --create
 *
 * Prints price IDs to set on Vercel. Never logs the full secret key.
 */
import { bootstrapStripeCatalog } from "../src/lib/server/stripe-bootstrap.ts";
import { maskStripeSecret } from "../src/lib/server/stripe-catalog.ts";

const create = process.argv.includes("--create");

const result = await bootstrapStripeCatalog({ createMissing: create });
console.log(`Stripe catalog (${create ? "create missing" : "status only"})`);
console.log(`secret: ${maskStripeSecret(process.env.STRIPE_SECRET_KEY)} · live=${result.live}`);
console.log("");
for (const row of result.rows) {
  const id = row.envPriceId || row.createdPriceId || row.existingPriceId || "MISSING";
  console.log(`${row.envName}=${id}  # ${row.lookupKey} · $${row.amountCad} CAD · ${row.action}`);
}
console.log("");
console.log("Set these on Vercel (Production + Preview). Do not paste sk_live_ into git.");
if (!create && result.rows.some((r) => r.action === "missing")) {
  console.log("Re-run with --create after confirming STRIPE_SECRET_KEY is sk_live_.");
}
