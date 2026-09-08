import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isShareCancellation, preferOsShare } from "../src/lib/native.ts";
import {
  SHARE_APP_URL,
  appSharePayload,
  copyText,
  listingSharePayload,
  listingShareUrl,
  shareOrCopy,
} from "../src/lib/share.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("share URLs stay on the public www origin without store IDs", () => {
  assert.equal(SHARE_APP_URL, "https://www.kidease.ca");
  assert.equal(listingShareUrl("bright-beginnings"), "https://www.kidease.ca/daycare/bright-beginnings");
  assert.equal(listingShareUrl("/daycare/harrow-house/"), "https://www.kidease.ca/daycare/harrow-house");
  const app = appSharePayload({ title: "KidEase", text: "Find licensed childcare near you on KidEase" });
  assert.equal(app.url, "https://www.kidease.ca");
  assert.match(app.text, /Find licensed childcare near you on KidEase/);
  const listing = listingSharePayload({
    name: "Harrow House",
    slug: "harrow-house",
    text: "See this licensed centre on KidEase",
  });
  assert.equal(listing.title, "Harrow House");
  assert.equal(listing.url, "https://www.kidease.ca/daycare/harrow-house");
});

test("share cancellation is abort or dismiss, not a generic failure", () => {
  assert.equal(isShareCancellation({ name: "AbortError", message: "" }), true);
  assert.equal(isShareCancellation({ name: "Error", message: "Share canceled" }), true);
  assert.equal(isShareCancellation({ name: "NotAllowedError", message: "Permission denied" }), false);
  assert.equal(isShareCancellation(null), false);
});

test("preferOsShare is mobile/native only — desktop falls through to clipboard", () => {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { share: async () => undefined, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" },
  });
  assert.equal(preferOsShare(), false);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      share: async () => undefined,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      maxTouchPoints: 5,
    },
  });
  assert.equal(preferOsShare(), true);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
});

test("shareOrCopy uses Web Share when available and copies the link otherwise", async () => {
  const originalShare = globalThis.navigator?.share;
  const originalClipboard = globalThis.navigator?.clipboard;
  const payload = appSharePayload({ title: "KidEase", text: "Find licensed childcare near you on KidEase" });

  const sharedNav = {
    share: async () => undefined,
    clipboard: originalClipboard,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    maxTouchPoints: 5,
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: sharedNav });
  assert.equal(await shareOrCopy(payload), "shared");

  const cancelledNav = {
    share: async () => {
      const err = new Error("Share canceled");
      err.name = "AbortError";
      throw err;
    },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    maxTouchPoints: 5,
    clipboard: { writeText: async () => assert.fail("should not copy after cancel") },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: cancelledNav });
  assert.equal(await shareOrCopy(payload), "cancelled");

  let copied = "";
  const copyNav = { clipboard: { writeText: async (value) => { copied = value; } } };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: copyNav });
  assert.equal(await shareOrCopy(payload), "copied");
  assert.equal(copied, "https://www.kidease.ca");
  assert.equal(await copyText("https://www.kidease.ca/daycare/demo"), true);

  const failNav = {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: failNav });
  assert.equal(await shareOrCopy(payload), "failed");

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { share: originalShare, clipboard: originalClipboard },
  });
});

test("Share KidEase lives in the header, account menu, app menu, and drawer", () => {
  const shell = src("src/components/shell.tsx");
  const menu = src("src/routes/menu.tsx");
  const drawer = src("src/components/nav-drawer.tsx");
  assert.match(shell, /ShareKidEaseButton/);
  assert.match(shell, /appearance="nav"/);
  assert.match(shell, /appearance="menu"/);
  assert.match(menu, /ShareKidEaseButton/);
  assert.match(menu, /appearance="row"/);
  assert.match(drawer, /ShareKidEaseButton/);
  assert.match(drawer, /appearance="drawer"/);
});

test("listing cards and listing detail share the centre deep link", () => {
  const card = src("src/components/daycare-card.tsx");
  const listing = src("src/routes/daycare.$slug.tsx");
  const button = src("src/components/share-button.tsx");
  assert.match(card, /ShareListingButton/);
  assert.match(card, /appearance="photo"/);
  assert.match(listing, /ShareListingButton/);
  assert.match(listing, /d\.slug/);
  assert.match(button, /listingSharePayload/);
  assert.match(button, /linkCopied/);
  assert.match(button, /shareDone/);
  assert.match(button, /shareListingAria/);
  assert.match(button, /aria-label=\{ariaLabel\}/);
});

test("share copy is present in English and French", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /shareKidEase: "Share KidEase"/);
  assert.match(copy, /shareKidEase: "Partager KidEase"/);
  assert.match(copy, /shareKidEaseText: "Find licensed childcare near you on KidEase"/);
  assert.match(copy, /shareKidEaseText: "Trouvez une garde d’enfants permise près de chez vous sur KidEase"/);
  assert.match(copy, /linkCopied: "Link copied"/);
  assert.match(copy, /linkCopied: "Lien copié"/);
});

test("share v1 does not touch OAuth buttons or invent store IDs", () => {
  const login = src("src/routes/login.tsx");
  const share = src("src/lib/share.ts");
  assert.match(login, /continueGoogle/);
  assert.doesNotMatch(share, /apps\.apple\.com|play\.google\.com|itunes\.apple\.com/);
  assert.doesNotMatch(share, /utm_|ref=/);
});
