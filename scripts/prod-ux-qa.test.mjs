import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import { isAdminOnlyListing, isPublicListing, publicListings } from "../src/lib/listing-visibility.ts";
import { resolvePostLoginPath, headerDesks, desksFor, canSeeAdminDesk } from "../src/lib/desks.ts";
import { isSensitiveDeskPath } from "./request-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("vercel no longer 302s /parent to Parent Sign In", () => {
  const vercel = src("vercel.json");
  assert.doesNotMatch(vercel, /"source": "\/parent"/);
  assert.doesNotMatch(vercel, /\/login\?role=parent/);
  assert.match(src("src/routes/parent.tsx"), /createFileRoute\("\/parent"\)/);
  assert.match(src("src/routes/parent.tsx"), /RedirectToSignIn/);
  assert.doesNotMatch(src("src/routes/parent.tsx"), /canSeeAdminDesk/);
});

test("admin can land on Parent desk; parent-only still cannot see Admin", () => {
  const adminDesks = desksFor({ role: "admin" });
  assert.equal(adminDesks.includes("parent"), true);
  assert.equal(resolvePostLoginPath({ next: "/parent", desks: adminDesks, role: "parent" }), "/parent");
  assert.deepEqual(headerDesks(adminDesks, "admin"), ["admin", "parent", "provider"]);
  assert.equal(headerDesks(desksFor({ role: "parent" }), "parent").includes("admin"), false);
  assert.equal(canSeeAdminDesk("parent"), false);
  assert.match(src("src/routes/login.tsx"), /resolvePostLoginPath/);
  assert.match(src("src/routes/login.tsx"), /sessionPending/);
});

test("Cloudflare Access stay off public, parent, provider, and auth APIs", () => {
  for (const path of ["/", "/parent", "/provider", "/login", "/search", "/api/auth/get-session", "/_serverFn/x"]) {
    assert.equal(isSensitiveDeskPath(path), false, path);
  }
  assert.equal(isSensitiveDeskPath("/admin"), true);
  const docs = src("docs/cloudflare.md");
  assert.match(docs, /Access application \(ops checklist\)/);
  assert.match(docs, /\/api\/admin\/\*/);
  assert.match(docs, /Do not\*\* add `\*`, `\/`, `\/parent`/);
  assert.match(src("docs/support.md"), /Do \*\*not\*\* lock `\/`, `\/parent`/);
});

test("provider subscription is its own page, not Promote leftover", () => {
  const provider = src("src/routes/provider.tsx");
  const route = src("src/routes/provider.subscription.tsx");
  const panel = src("src/components/provider-subscription.tsx");
  assert.match(provider, /<Outlet \/>/);
  assert.match(provider, /childRoute/);
  assert.match(route, /ProviderSubscriptionPanel/);
  assert.match(panel, /Centre plans for listing/);
  assert.doesNotMatch(route, /PromotePanel/);
});

test("public rails and search drop TEST / ghost leftover rows", () => {
  const ghost = GHOST_LISTING;
  const real = { id: "mb-1", slug: "bonnie-bairns", name: "Bonnie Bairns" };
  assert.deepEqual(
    publicListings([ghost, real, { id: "g2", name: "ghost listing" }]).map((row) => row.slug),
    ["bonnie-bairns"],
  );
  assert.equal(isAdminOnlyListing({ name: "TEST Ghost Claim Lab" }), true);
  assert.equal(isPublicListing(real), true);
  assert.match(src("src/lib/server/daycares.ts"), /publicListings\(uniqueById/);
  assert.match(src("src/lib/parent-rails.ts"), /isPublicListing/);
});

test("Share KidEase always surfaces a toast on copy or share", () => {
  const button = src("src/components/share-button.tsx");
  assert.match(button, /toast\.success\(messages\.copied\)/);
  assert.match(button, /toast\.success\(messages\.shared\)/);
  assert.match(button, /t\("shareDone"\)/);
  assert.match(src("src/lib/native.ts"), /preferOsShare/);
  assert.match(src("src/lib/share.ts"), /copyText/);
});
