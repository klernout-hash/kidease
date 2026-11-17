import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parent requests use a listing card, not a text-only row", () => {
  const requests = src("src/components/parent-requests.tsx");
  assert.match(requests, /data-ke="parent-request-card"/);
  assert.match(requests, /ListingPhotoFallback/);
  assert.match(requests, /min-h-11 min-w-11/);
  assert.match(requests, /data-ke="request-status"/);
  assert.doesNotMatch(requests, /Photo not available|Photo pending/);
});

test("today's look keeps a 44px floor where the clean look already asks for one", () => {
  const css = src("src/styles.css");
  assert.match(css, /html:not\(\[data-look="clean"\]\) :is\(a, button, summary, select, input, label, \[role="button"\], \[role="tab"\]\):is\(\.min-h-11/);
  assert.match(css, /min-height: max\(44px, 2\.75rem\)/);
  assert.match(css, /header \.size-9 \{\s*width: 44px;\s*height: 44px;/);
});

test("today records load apart from the first daycare screen", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /import\("@\/components\/safe-arrival-panel"\)/);
  assert.match(provider, /import\("@\/components\/cert-expiry-panel"\)/);
  assert.match(provider, /import\("@\/components\/child-health-log"\)/);
  assert.match(provider, /import\("@\/components\/family-invite-gap"\)/);
});
