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
  assert.equal(isSensitiveDeskPath("/api/admin/contracts"), true);
  assert.equal(isSensitiveDeskPath("/api/admin/media"), true);
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
});

test("admin on www / apex / localhost is not redirected by this guard", () => {
  for (const host of ["www.kidease.ca", "kidease.ca", "localhost:8080"]) {
    assert.deepEqual(decideRequest({ host, pathname: "/admin" }), { action: "next" });
    assert.deepEqual(decideRequest({ host, pathname: "/admin-contracts" }), { action: "next" });
  }
});

test("spoofed sibling host does not look like vercel.app", () => {
  assert.deepEqual(
    decideRequest({ host: "vercel.app.evil.com", pathname: "/admin" }),
    { action: "next" },
  );
});

test("/.well-known/change-password redirects to /login on every host", () => {
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
  assert.equal(CHANGE_PASSWORD_DESTINATION, "/login");
});

test("nitro middleware and vercel.json stay wired to the guard", () => {
  const middleware = readFileSync(join(root, "server/middleware/request-guard.ts"), "utf8");
  assert.match(middleware, /from "\.\.\/\.\.\/scripts\/request-guard\.mjs"/);
  assert.match(middleware, /headers\.get\("host"\)/);
  assert.doesNotMatch(middleware, /x-forwarded-host/);

  const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);

  const vercel = readFileSync(join(root, "vercel.json"), "utf8");
  assert.match(vercel, /"source": "\/\.well-known\/change-password"/);
  assert.match(vercel, /"destination": "\/login"/);
  assert.match(vercel, /"source": "\/admin"/);
  assert.match(vercel, /"destination": "https:\/\/www\.kidease\.ca\/admin"/);
  assert.match(vercel, /"source": "\/admin-contracts"/);
  assert.match(vercel, /\\\\.vercel\\\\.app/);
  assert.doesNotMatch(vercel, /"source": "\/"/);
});
