import { test } from "node:test";
import assert from "node:assert/strict";
import {
  POLISH_PAGES,
  POLISH_SITEMAP_PATHS,
  POLISH_WIDTHS,
  localAuditUrl,
  polishPath,
  polishProfiles,
} from "./polish-coverage.mjs";

test("audit cannot target a remote server or a health path even with external override set", () => {
  const old = process.env.BROWSER_ALLOW_EXTERNAL_HOST;
  process.env.BROWSER_ALLOW_EXTERNAL_HOST = "1";
  try {
    for (const url of [
      "https://kidease.ca",
      "http://127.0.0.1/api/health",
      "http://user:secret@localhost:8081",
      "file:///tmp/page",
      "http://127.0.0.1.example.com:8081",
    ])
      assert.throws(() => localAuditUrl(url));
    assert.equal(localAuditUrl("http://127.0.0.1:8081/"), "http://127.0.0.1:8081");
  } finally {
    if (old === undefined) delete process.env.BROWSER_ALLOW_EXTERNAL_HOST;
    else process.env.BROWSER_ALLOW_EXTERNAL_HOST = old;
  }
});

test("coverage preserves the actual French admin route and provider desk panes", () => {
  const admin = POLISH_PAGES.find((page) => page.id === "admin");
  const org = POLISH_PAGES.find((page) => page.id === "org");
  assert.equal(polishPath(admin, "fr"), "/admin?lang=fr");
  assert.equal(polishPath(org, "fr"), "/fr/provider?desk=sites");
  assert.throws(() =>
    polishPath(
      POLISH_PAGES.find((page) => page.id === "listing"),
      "en",
      "../private",
    ),
  );
});

test("public inventory covers each canonical sitemap path and avoids indirect health collection", () => {
  for (const path of POLISH_SITEMAP_PATHS)
    assert.ok(
      POLISH_PAGES.find((page) => page.path === path),
      `Missing public route ${path}`,
    );
  assert.ok(POLISH_PAGES.find((page) => page.id === "status").safetyBlock);
});

test("matrix includes every requested width with landscape, large text and labeled zoom reflow", () => {
  const profiles = polishProfiles("matrix");
  for (const width of POLISH_WIDTHS) {
    assert.ok(
      profiles.find((profile) => profile.id === `${width}-portrait` && profile.width === width),
    );
    assert.ok(
      profiles.find((profile) => profile.id === `${width}-landscape` && profile.height === width),
    );
    assert.ok(
      profiles.find(
        (profile) => profile.id === `${width}-large-text` && profile.textScale === "xl",
      ),
    );
    assert.ok(
      profiles.find(
        (profile) =>
          profile.id === `${width}-zoom-reflow-200` &&
          profile.width === Math.round(width / 2) &&
          profile.reflowZoom === 2,
      ),
    );
  }
});
