import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { safeErrorCopy } from "../src/lib/safe-error.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("crash copy never includes a database or stack detail", () => {
  for (const path of ["/admin-ranking", "/admin-vacancies", "/fr/parent", "/"]) {
    const copy = safeErrorCopy(path);
    const text = JSON.stringify(copy);
    assert.match(copy.title, /wrong|mal passé/);
    assert.doesNotMatch(text, /relation |postgres:|password|stack|node_modules|SELECT /i);
  }
  assert.match(safeErrorCopy("/fr/admin-ranking").title, /mal passé/);
});

test("error screens do not render the raw error", () => {
  const boundary = src("src/components/safe-error-boundary.tsx");
  const app = src("src/lib/error-component.tsx");
  const rootRoute = src("src/routes/__root.tsx");
  assert.doesNotMatch(boundary, /error\.message/);
  assert.doesNotMatch(app.slice(app.indexOf("return (")), /error\.message|publicErrorMessage/);
  assert.doesNotMatch(rootRoute, /error\.message/);
  assert.match(rootRoute, /SafeRouteError/);
  assert.match(boundary, /data-ke="safe-error"/);
});

test("provincial openings and demand tabs load through a server function", () => {
  const vacancies = src("src/routes/admin-vacancies.tsx");
  const ranking = src("src/routes/admin-ranking.tsx");
  assert.match(vacancies, /loadProvincialOpeningsDesk/);
  assert.match(vacancies, /errorComponent: SafeRouteError/);
  assert.doesNotMatch(vacancies, /getSql|error\.message/);
  assert.match(ranking, /loadRankingMarketDesk/);
  assert.match(ranking, /errorComponent: SafeRouteError/);
  assert.doesNotMatch(ranking, /listRankingMarket\(/);
  const desk = src("src/lib/server/admin-listings-desk.ts");
  assert.match(desk, /report unavailable/);
  assert.doesNotMatch(desk, /err\.message|error\.message/);
});

test("news and SMS consent boxes start unchecked", () => {
  const panel = src("src/components/saved-searches-panel.tsx");
  assert.match(panel, /emailEnabled: false/);
  assert.match(panel, /smsEnabled: false/);
  assert.match(panel, /emailCommercial: false/);
  assert.doesNotMatch(panel, /smsEnabled: true/);
  assert.doesNotMatch(panel, /emailCommercial: true/);
  assert.match(panel, /prefsReady && prefs.smsEnabled === true/);
  assert.match(panel, /prefsReady && prefs.emailCommercial === true/);
  assert.match(panel, /data-ke="casl-sms"/);
  assert.match(panel, /data-ke="casl-news-offers"/);
});
