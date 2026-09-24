import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { tx } from "../src/lib/copy.ts";
import {
  REQUEST_SENT_BEAT_MS,
  requestSentBodyKey,
  requestSentThumb,
  requestSentTitleKey,
} from "../src/lib/request-sent.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("success copy stays honest and matches the request kind", () => {
  assert.equal(tx("en", requestSentTitleKey("info")), "Request sent!");
  assert.equal(tx("en", requestSentTitleKey("message")), "Request sent!");
  assert.equal(tx("en", requestSentTitleKey("spot")), "Request sent!");
  assert.equal(tx("en", requestSentTitleKey("tour")), "Tour request sent!");
  assert.equal(tx("fr", requestSentTitleKey("tour")), "Demande de visite envoyée !");
  assert.match(tx("en", requestSentBodyKey("info")), /\{name\}/);
  assert.match(tx("en", requestSentBodyKey("info")), /email/i);
  assert.match(tx("en", requestSentBodyKey("tour")), /Messages/);
  assert.match(tx("en", requestSentBodyKey("tour")), /confirms the date and time/);
  assert.match(tx("fr", requestSentBodyKey("message")), /Messages/);
  assert.equal(tx("en", "requestSentViewMessages"), "View messages");
  assert.equal(tx("fr", "requestSentBackToListing"), "Retour à la fiche");
  for (const kind of ["info", "tour", "spot", "message"]) {
    const body = tx("en", requestSentBodyKey(kind));
    assert.doesNotMatch(body, /within \d|business day|4–8 weeks|thursday morning|instant book/i);
  }
});

test("confirmation thumb uses a real listing photo only", () => {
  assert.equal(requestSentThumb(undefined), null);
  assert.equal(requestSentThumb([]), null);
  assert.equal(requestSentThumb(["/photos/storefront-placeholder-480.webp"]), null);
  assert.equal(requestSentThumb(["/photos/community.jpg"]), null);
  assert.equal(requestSentThumb(["/photos/wpg/2121.jpg"]), null);
  assert.equal(requestSentThumb(["/photos/buildings/centre.jpg"]), "/photos/buildings/centre.jpg");
});

test("listing request forms share one success dialog and keep errors off it", () => {
  const dialog = src("src/components/request-sent-dialog.tsx");
  const css = src("src/styles.css");
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /role="status"/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, /prefers-reduced-motion: reduce/);
  assert.match(dialog, /requestSentViewMessages/);
  assert.match(dialog, /requestSentBackToListing/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /ke-check-pop/);
  assert.equal(REQUEST_SENT_BEAT_MS >= 300 && REQUEST_SENT_BEAT_MS <= 800, true);

  for (const rel of [
    "src/components/request-info.tsx",
    "src/components/request-tour.tsx",
    "src/components/request-spot.tsx",
    "src/components/request-message.tsx",
    "src/routes/book.$slug.tsx",
  ]) {
    const file = src(rel);
    assert.match(file, /RequestSentDialog/, rel);
    assert.match(file, /holdSendBeat/, rel);
    assert.match(file, /requestSentSending/, rel);
    const beat = file.indexOf("holdSendBeat");
    const shown = ["setDone(true)", "setDone({", "setSent({"]
      .map((mark) => file.indexOf(mark))
      .filter((at) => at >= 0);
    assert.ok(beat !== -1 && shown.length > 0 && Math.min(...shown) > beat, rel);
  }

  const info = src("src/components/request-info.tsx");
  assert.match(info, /data-ke="request-info-error"/);
  assert.match(info, /setFormError/);
  assert.doesNotMatch(
    info.slice(info.indexOf("catch"), info.indexOf("finally")),
    /setDone\(true\)/,
  );
  assert.match(src("src/components/request-message.tsx"), /sendConnectedMessage/);
  assert.doesNotMatch(src("src/components/request-message.tsx"), /sendMessage\(/);
  assert.doesNotMatch(dialog, /approve-live|casl-consent|admin-trust/);
});
