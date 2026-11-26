import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { build } from "vite";

// Local synthetic fixture only: every browser request is intercepted. No invite is redeemed.
const root = fileURLToPath(new URL("../", import.meta.url));
const token = "test-only_".padEnd(24, "a");
const aliases = {
  "@tanstack/react-router": "router",
  "@/lib/use-copy": "copy",
  "@/lib/server/coparent": "desk",
  "@/lib/server/coparent-email": "email",
};
const stubs = {
  entry: `import React from "react"; import {createRoot} from "react-dom/client";
    import {CoparentDesk} from "@/components/coparent-desk";
    createRoot(document.getElementById("root")).render(React.createElement(CoparentDesk));`,
  router: `export const useRouterState = ({select}) => select({location: window.location});
    export const Link = () => null;`,
  copy: "export const useCopy = () => ({locale: document.documentElement.lang});",
  desk: `export async function listCoparent() {
      return {enabled:true, emailEnabled:false, role:"owner", status:"pending", inviteToken:${JSON.stringify(token)}};
    }
    export const acceptCoparentInvite = createCoparentInvite,
      removeCoparent = createCoparentInvite, setCoparentAccess = createCoparentInvite;
    export function createCoparentInvite() { throw new Error("fixture does not mutate"); }`,
  email:
    'export function inviteCoparentByEmail() { throw new Error("fixture does not send email"); }',
};
const bundle = await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "error",
  plugins: [
    react(),
    {
      name: "coparent-share-fixture",
      enforce: "pre",
      resolveId(id) {
        const key = id === "virtual:entry" ? "entry" : aliases[id];
        if (key) return "\0" + key;
      },
      load(id) {
        if (id.startsWith("\0")) return stubs[id.slice(1)];
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@\/(?!lib\/(?:use-copy|server\/coparent(?:-email)?)(?:$|\/))/,
        replacement: join(root, "src/") + "/",
      },
    ],
  },
  build: {
    write: false,
    rollupOptions: { input: "virtual:entry", output: { codeSplitting: false } },
  },
});
const js = bundle.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry).code;
const assets = join(root, ".vercel/output/static/assets");
const cssName =
  existsSync(assets) && readdirSync(assets).find((name) => /^styles-.*\.css$/.test(name));
const css = cssName ? readFileSync(join(assets, cssName)) : "";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: ["--no-sandbox"],
});
try {
  for (const [origin, expectedOrigin, lang, width, hasTouch = true] of [
    ["https://kidease.ca", "https://www.kidease.ca", "en", 390],
    ["https://www.kidease.ca", "https://www.kidease.ca", "fr", 1280],
    ["https://preview.example.invalid", "https://preview.example.invalid", "fr", 390],
    ["https://preview.example.invalid", "https://preview.example.invalid", "en", 1280],
    ["https://www.kidease.ca", "https://www.kidease.ca", "en", 1280, false],
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, hasTouch });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const path = lang === "fr" ? "/fr/parent" : "/parent";
    await page.addInitScript(() => {
      document.execCommand = () => false; // Exercise the existing asynchronous clipboard fallback.
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text) => {
            window.copied = text;
          },
        },
      });
      Object.defineProperty(navigator, "canShare", { value: () => true });
      Object.defineProperty(navigator, "share", {
        value: async (data) => {
          window.payload = data;
        },
      });
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/harness.js")
        return route.fulfill({ contentType: "text/javascript", body: js });
      if (url.pathname === "/fixture.css")
        return route.fulfill({ contentType: "text/css", body: css });
      if (url.pathname !== path) return route.abort();
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script type="module" src="/harness.js"></script></body></html>`,
      });
    });
    await page.goto(origin + path);
    const expected = expectedOrigin + path + "?tab=family&invite=" + token;
    await page
      .getByText(expected, { exact: true })
      .waitFor({ timeout: 6000 })
      .catch(async (error) => {
        console.error({
          origin,
          pageUrl: page.url(),
          errors,
          body: await page.locator("body").innerText(),
        });
        throw error;
      });
    await page
      .getByRole("button", { name: lang === "fr" ? "Copier le lien" : "Copy the link" })
      .click();
    await page.waitForFunction((url) => window.copied === url, expected);
    assert.equal(
      await page
        .getByText(lang === "fr" ? /Partagez ce lien uniquement/ : /Only share this link/)
        .count(),
      1,
    );
    const share = page.getByRole("button", {
      name: lang === "fr" ? "Partager le lien" : "Share the link",
    });
    if (hasTouch) {
      await share.click();
      await page.waitForFunction((url) => window.payload?.url === url, expected);
    } else {
      assert.equal(await share.count(), 0, "Desktop without a share sheet only shows Copy");
    }
    assert.deepEqual(errors, []);
    if (css && process.env.KE_SHARE_SCREENSHOTS) {
      await page.screenshot({
        path: join(
          process.env.KE_SHARE_SCREENSHOTS,
          `family-share-${lang}-${width}-${new URL(origin).hostname}.png`,
        ),
      });
    }
    await page.close();
    console.log(
      `PASS ${lang.toUpperCase()} ${width}px ${new URL(origin).hostname}: display, clipboard, ${hasTouch ? "share" : "no duplicate share button"}`,
    );
  }
} finally {
  await browser.close();
}
