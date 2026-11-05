/**
 * Screenshot the 16 official branded-email drafts at 390 and 600, light and dark.
 * Does not send mail. Reads docs/branded-emails/*.html.
 */
import { chromium } from "playwright";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/branded-emails");
const files = (await readdir(dir)).filter((name) => /^\d{2}-.+\.html$/.test(name)).sort();
const browser = await chromium.launch();
for (const file of files) {
  const html = await readFile(path.join(dir, file), "utf8");
  const base = file.replace(/\.html$/, "");
  for (const width of [390, 600]) {
    for (const scheme of ["light", "dark"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      });
      await page.setContent(html, { waitUntil: "load" });
      const out = path.join(dir, `${base}-${width}-${scheme}.png`);
      await page.screenshot({ path: out, fullPage: true });
      await page.close();
      console.log("wrote", path.basename(out));
    }
  }
}
await browser.close();
console.log("done", files.length * 4);
