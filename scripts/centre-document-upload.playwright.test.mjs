/**
 * A text file must come back as 415 and must not change the score.
 * A PDF must be stored, show as on file, and keep the higher score after reload.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium } from "playwright";
import { inferPrivateDocMime, isAllowedPrivateDocMime, PRIVATE_DOC_MAX_BYTES } from "../src/lib/private-docs.ts";

function page(state) {
  const score = state.handbook ? 13 : 0;
  const status = state.handbook ? "On file" : "Missing";
  return `<!doctype html><html><body>
    <section data-ke="centre-documents">
      <p data-ke="centre-documents-score">${score}% complete</p>
      <p data-ke="centre-document-status">${status}</p>
      <p data-ke="centre-document-error"></p>
      <label for="centre-doc-handbook">Upload</label>
      <input id="centre-doc-handbook" data-ke="centre-document-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)" />
    </section>
    <script>
      document.querySelector("[data-ke=centre-document-file]").addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(file);
        });
        const response = await fetch("/api/centre-documents/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dataUrl, mime: file.type, filename: file.name }),
        });
        const body = await response.json();
        if (!response.ok || !body.ok || !body.id) {
          document.querySelector("[data-ke=centre-document-error]").textContent = body.error || "PDF, JPG, PNG or WebP only";
          return;
        }
        location.reload();
      });
    </script>
  </body></html>`;
}

function start() {
  const state = { handbook: false, stored: 0 };
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/api/centre-documents/upload") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      const mime = inferPrivateDocMime({ mime: body.mime, filename: body.filename, dataUrl: body.dataUrl });
      const dataUrl = String(body.dataUrl || "");
      const comma = dataUrl.indexOf(",");
      const bytes = Buffer.from(comma >= 0 ? dataUrl.slice(comma + 1) : "", "base64");
      if (!bytes.length || !isAllowedPrivateDocMime(mime) || bytes.length > PRIVATE_DOC_MAX_BYTES) {
        res.writeHead(415, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "PDF, JPG, PNG or WebP only" }));
        return;
      }
      state.handbook = true;
      state.stored += 1;
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, id: "cdc_test" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page(state));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, state, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

test("a text file is rejected and a PDF raises the score after reload", async (t) => {
  const { server, state, port } = await start();
  const base = `http://127.0.0.1:${port}`;
  try {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/Executable doesn't exist|browserType\.launch|Failed to launch/i.test(message)) throw err;
      t.skip("chromium is not installed");
      return;
    }
    const tab = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await tab.goto(base, { waitUntil: "domcontentloaded" });
    assert.match(await tab.locator("[data-ke=centre-documents-score]").innerText(), /0%/);
    await tab.locator("[data-ke=centre-document-file]").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a daycare file"),
    });
    await tab.getByText("PDF, JPG, PNG or WebP only").waitFor();
    assert.equal(state.stored, 0);
    assert.match(await tab.locator("[data-ke=centre-documents-score]").innerText(), /0%/);
    await tab.locator("[data-ke=centre-document-file]").setInputFiles({
      name: "handbook.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 handbook"),
    });
    await tab.locator("[data-ke=centre-document-status]", { hasText: "On file" }).waitFor();
    await tab.locator("[data-ke=centre-document-status]").waitFor();
    assert.match(await tab.locator("[data-ke=centre-document-status]").innerText(), /On file/);
    assert.match(await tab.locator("[data-ke=centre-documents-score]").innerText(), /13%/);
    await tab.reload({ waitUntil: "domcontentloaded" });
    assert.match(await tab.locator("[data-ke=centre-document-status]").innerText(), /On file/);
    assert.match(await tab.locator("[data-ke=centre-documents-score]").innerText(), /13%/);
    assert.equal(state.stored, 1);
    await browser.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
