import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CANONICAL_ORIGIN,
  CHANGE_PASSWORD_DESTINATION,
  CHANGE_PASSWORD_PATH,
  decideRequest,
  HIDDEN_LISTING_SLUGS,
  isHiddenListingPath,
  isSensitiveDeskPath,
  isVercelAppHost,
} from "./request-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("isVercelAppHost matches system domains including kidease-git", () => {
  assert.equal(isVercelAppHost("kidease-git.vercel.app"), true);
  assert.equal(isVercelAppHost("KIDEASE-GIT.VERCEL.APP"), true);
  assert.equal(isVercelAppHost("kidease-git.vercel.app:443"), true);
  assert.equal(isVercelAppHost("preview-branch.vercel.app"), true);
  assert.equal(isVercelAppHost("vercel.app"), true);
  assert.equal(isVercelAppHost("www.kidease.ca"), false);
  assert.equal(isVercelAppHost("kidease.ca"), false);
  assert.equal(isVercelAppHost("localhost:8080"), false);
  assert.equal(isVercelAppHost("vercel.app.evil.com"), false);
});

test("isSensitiveDeskPath is prefix-safe", () => {
  assert.equal(isSensitiveDeskPath("/admin"), true);
  assert.equal(isSensitiveDeskPath("/admin/"), true);
  assert.equal(isSensitiveDeskPath("/admin/queue"), true);
  assert.equal(isSensitiveDeskPath("/admin-contracts"), true);
  assert.equal(isSensitiveDeskPath("/admin-contracts/"), true);
  assert.equal(isSensitiveDeskPath("/admin-chat"), true);
  assert.equal(isSensitiveDeskPath("/admin-chat/"), true);
  assert.equal(isSensitiveDeskPath("/api/admin/contracts"), true);
  assert.equal(isSensitiveDeskPath("/api/admin/media"), true);
  assert.equal(isSensitiveDeskPath("/api/admin/sentry-test"), true);
  assert.equal(isSensitiveDeskPath("/support"), true);
  assert.equal(isSensitiveDeskPath("/support/sc_abc"), true);
  assert.equal(isSensitiveDeskPath("/help"), false);
  assert.equal(isSensitiveDeskPath("/administrator"), false);
  assert.equal(isSensitiveDeskPath("/provider"), false);
  assert.equal(isSensitiveDeskPath("/parent"), false);
  assert.equal(isSensitiveDeskPath("/"), false);
  assert.equal(isSensitiveDeskPath("/login"), false);
});

test("health check / on kidease-git.vercel.app is not redirected", () => {
  assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/" }), {
    action: "next",
  });
  assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/", search: "?ok=1" }), {
    action: "next",
  });
});

test("public pages on vercel.app stay on that host", () => {
  for (const pathname of ["/", "/search", "/login", "/privacy", "/about"]) {
    assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname }), {
      action: "next",
    });
  }
});

test("admin desks on vercel.app 302 to www so Cloudflare Access applies", () => {
  assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/admin" }), {
    action: "redirect",
    status: 302,
    location: `${CANONICAL_ORIGIN}/admin`,
  });
  assert.deepEqual(
    decideRequest({ host: "kidease-git.vercel.app", pathname: "/admin-contracts" }),
    {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}/admin-contracts`,
    },
  );
  assert.deepEqual(
    decideRequest({ host: "kidease-git.vercel.app", pathname: "/admin-chat" }),
    {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}/admin-chat`,
    },
  );
  assert.deepEqual(
    decideRequest({ host: "kidease-git.vercel.app", pathname: "/admin", search: "?tab=mail" }),
    {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}/admin?tab=mail`,
    },
  );
  assert.deepEqual(
    decideRequest({ host: "other.vercel.app", pathname: "/api/admin/contracts" }),
    {
      action: "redirect",
      status: 302,
      location: `${CANONICAL_ORIGIN}/api/admin/contracts`,
    },
  );
  assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/support" }), {
    action: "redirect",
    status: 302,
    location: `${CANONICAL_ORIGIN}/support`,
  });
  assert.deepEqual(decideRequest({ host: "kidease-git.vercel.app", pathname: "/help" }), {
    action: "next",
  });
});

test("admin on www / apex / localhost is not redirected by this guard", () => {
  for (const host of ["www.kidease.ca", "kidease.ca", "localhost:8080"]) {
    assert.deepEqual(decideRequest({ host, pathname: "/admin" }), { action: "next" });
    assert.deepEqual(decideRequest({ host, pathname: "/admin-contracts" }), { action: "next" });
    assert.deepEqual(decideRequest({ host, pathname: "/admin-chat" }), { action: "next" });
  }
});

test("spoofed sibling host does not look like vercel.app", () => {
  assert.deepEqual(
    decideRequest({ host: "vercel.app.evil.com", pathname: "/admin" }),
    { action: "next" },
  );
});

test("AASA and assetlinks are not redirected or 404'd by the request guard", () => {
  for (const host of ["www.kidease.ca", "kidease-git.vercel.app", "localhost:8080"]) {
    for (const pathname of [
      "/.well-known/apple-app-site-association",
      "/.well-known/apple-app-site-association.json",
      "/.well-known/assetlinks.json",
    ]) {
      assert.deepEqual(decideRequest({ host, pathname }), { action: "next" });
    }
  }
});

test("/.well-known/change-password redirects to /forgot-password on every host", () => {
  for (const host of ["www.kidease.ca", "kidease-git.vercel.app", "localhost:8080"]) {
    assert.deepEqual(decideRequest({ host, pathname: CHANGE_PASSWORD_PATH }), {
      action: "redirect",
      status: 302,
      location: CHANGE_PASSWORD_DESTINATION,
    });
    assert.deepEqual(decideRequest({ host, pathname: `${CHANGE_PASSWORD_PATH}/` }), {
      action: "redirect",
      status: 302,
      location: CHANGE_PASSWORD_DESTINATION,
    });
  }
  assert.equal(CHANGE_PASSWORD_DESTINATION, "/forgot-password");
});

test("hidden listing slugs include the QA ghost id and slug", () => {
  assert.deepEqual(HIDDEN_LISTING_SLUGS, ["test-ghost-claim-lab", "ke-test-ghost-001"]);
});

test("isHiddenListingPath matches daycare and book aliases, not claim or search", () => {
  assert.equal(isHiddenListingPath("/daycare/test-ghost-claim-lab"), true);
  assert.equal(isHiddenListingPath("/daycare/test-ghost-claim-lab/"), true);
  assert.equal(isHiddenListingPath("/Daycare/TEST-GHOST-CLAIM-LAB"), true);
  assert.equal(isHiddenListingPath("/book/test-ghost-claim-lab"), true);
  assert.equal(isHiddenListingPath("/book/ke-test-ghost-001"), true);
  assert.equal(isHiddenListingPath("/daycare/ke-test-ghost-001"), true);
  assert.equal(isHiddenListingPath("/daycare/bonnie-bairns-childcare-services-1"), false);
  assert.equal(isHiddenListingPath("/claim"), false);
  assert.equal(isHiddenListingPath("/admin"), false);
  assert.equal(isHiddenListingPath("/search"), false);
  assert.equal(isHiddenListingPath("/daycare/test-ghost-claim-lab-extra"), false);
});

test("QA ghost listing document URLs 404 on every host", () => {
  for (const host of ["www.kidease.ca", "kidease-git.vercel.app", "localhost:8080"]) {
    for (const pathname of [
      "/daycare/test-ghost-claim-lab",
      "/daycare/test-ghost-claim-lab/",
      "/book/test-ghost-claim-lab",
      "/daycare/ke-test-ghost-001",
    ]) {
      assert.deepEqual(decideRequest({ host, pathname }), { action: "not_found", status: 404 });
    }
  }
});

test("real listing document URLs are not 404'd by the guard", () => {
  assert.deepEqual(
    decideRequest({ host: "www.kidease.ca", pathname: "/daycare/bonnie-bairns-childcare-services-1" }),
    { action: "next" },
  );
  assert.deepEqual(decideRequest({ host: "www.kidease.ca", pathname: "/claim" }), { action: "next" });
});

test("nitro middleware and vercel.json stay wired to the guard", () => {
  const middleware = readFileSync(join(root, "server/middleware/request-guard.ts"), "utf8");
  assert.match(middleware, /from "\.\.\/\.\.\/scripts\/request-guard\.mjs"/);
  assert.match(middleware, /headers\.get\("host"\)/);
  assert.match(middleware, /decision\.action === "not_found"/);
  assert.doesNotMatch(middleware, /x-forwarded-host/);

  const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);

  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(vercel, /"source": "\/\.well-known\/change-password"/);
  assert.match(vercel, /"destination": "\/forgot-password"/);
  assert.match(vercel, /"source": "\/admin"/);
  assert.match(vercel, /"destination": "https:\/\/www\.kidease\.ca\/admin"/);
  assert.match(vercel, /"source": "\/admin-contracts"/);
  assert.match(vercel, /\\\\.vercel\\\\.app/);
  assert.doesNotMatch(vercel, /"source": "\/"/);
});
