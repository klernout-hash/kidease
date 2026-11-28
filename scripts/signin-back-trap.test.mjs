import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { authPageBackPlan } from "../src/lib/auth/auth-back.ts";
import { previousScreenHref } from "../src/lib/screen-history.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("N-78: Back from sign-in pops history only to a public page this tab saw", () => {
  assert.deepEqual(authPageBackPlan({ canGoBack: true, previousHref: "/daycare/synthetic-centre", fallback: "/" }), { via: "history" });
  assert.deepEqual(authPageBackPlan({ canGoBack: true, previousHref: "/search?city=winnipeg", fallback: "/" }), { via: "history" });
  assert.deepEqual(authPageBackPlan({ canGoBack: true, previousHref: "/fr/daycares", fallback: "/fr" }), { via: "history" });
});

test("N-78: the protected tab that sent the guest to sign-in is never the Back target (no trap)", () => {
  for (const previousHref of ["/inbox", "/parent", "/account", "/notifications", "/provider", "/fr/inbox", "/login", "/signup"]) {
    assert.deepEqual(
      authPageBackPlan({ canGoBack: true, previousHref, fallback: "/" }),
      { via: "replace", href: "/" },
      previousHref,
    );
  }
});

test("N-78: a cold open or a reloaded tab (no recorded screen) goes to the public fallback", () => {
  assert.deepEqual(authPageBackPlan({ canGoBack: false, previousHref: "/daycare/x", fallback: "/fr" }), { via: "replace", href: "/fr" });
  assert.deepEqual(authPageBackPlan({ canGoBack: true, previousHref: null, fallback: "/" }), { via: "replace", href: "/" });
});

test("N-78: previousScreenHref reads the entry right before this history index", () => {
  const crumbs = new Map([
    [0, { href: "/", labelKey: "home" }],
    [1, { href: "/inbox", labelKey: "home" }],
  ]);
  assert.equal(previousScreenHref(0, crumbs), null);
  assert.equal(previousScreenHref(1, crumbs), "/");
  assert.equal(previousScreenHref(2, crumbs), "/inbox");
  assert.equal(previousScreenHref(5, crumbs), null);
});

test("N-78: sign-in has a 44px Back at the top, and both Backs and Android Back share the plan", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /data-ke="login-top-back"/);
  assert.match(login, /aria-label=\{t\("back"\)\}/);
  assert.match(login, /min-h-11 min-w-11/);
  assert.match(login, /const plan = currentAuthPageBack\(router\.history\.canGoBack\(\), search\.next/);
  assert.equal((login.match(/leaveSignIn\(\);/g) || []).length, 2);
  assert.doesNotMatch(login, /currentAuthBackFallback/);
  const boot = src("src/components/native-boot.tsx");
  assert.match(boot, /if \(isAuthPagePath\(window\.location\.pathname\)\) \{/);
  assert.match(boot, /const plan = currentAuthPageBack\(canGoBack, next/);
  assert.match(boot, /if \(plan\.via === "replace"\) \{[\s\S]*?const target = safeInternalPath\(plan\.href, "\/"\);[\s\S]*?window\.location\.replace\(/);
});
