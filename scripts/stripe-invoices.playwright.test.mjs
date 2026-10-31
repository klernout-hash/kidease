/**
 * Playwright route check for the invoice list and PDF download.
 * Uses Playwright's request client so CI can run without a downloaded browser.
 * When Chromium is installed, it also opens the list and saves the PDF.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { test } from "node:test";
import { chromium, request as playwrightRequest } from "playwright";
import { invoicePdfHttpResponse } from "../src/lib/invoice-pdf.ts";
import { invoiceListHtml } from "../src/lib/invoice-list-html.ts";

const invoices = [
  {
    id: "in_open",
    number: "KE-1",
    amountCents: 1000,
    currency: "cad",
    status: "open",
    paidAt: null,
    hostedInvoiceUrl: "https://pay.stripe.com/invoice/open",
    daycareName: "Elm Daycare",
  },
  {
    id: "in_paid",
    number: "KE-2",
    amountCents: 2500,
    currency: "cad",
    status: "paid",
    paidAt: "2026-01-15T00:00:00.000Z",
    hostedInvoiceUrl: null,
    daycareName: "Elm Daycare",
  },
  {
    id: "in_failed",
    number: "KE-3",
    amountCents: 3000,
    currency: "cad",
    status: "failed",
    paidAt: null,
    hostedInvoiceUrl: "https://pay.stripe.com/invoice/failed",
    daycareName: "Elm Daycare",
  },
];

function start() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/invoices") {
      const html = invoiceListHtml(invoices, "en");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const match = url.pathname.match(/^\/api\/invoices\/([^/]+)\/pdf$/);
    if (match) {
      const id = decodeURIComponent(match[1]);
      const invoice = invoices.find((row) => row.id === id) || null;
      const response = invoicePdfHttpResponse({ invoice, authorized: true });
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, headers);
      res.end(body);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

test("playwright route serves the invoice list and a paid PDF download", async (t) => {
  const { server, port } = await start();
  const base = `http://127.0.0.1:${port}`;
  const api = await playwrightRequest.newContext();
  try {
    const page = await api.get(`${base}/invoices`);
    assert.equal(page.status(), 200);
    const html = await page.text();
    assert.match(html, /data-ke="invoice-status">Open/);
    assert.match(html, /data-ke="invoice-status">Paid/);
    assert.match(html, /data-ke="invoice-status">Failed/);
    assert.match(html, /Download PDF/);
    assert.match(html, /Print/);
    assert.match(html, /data-ke="invoice-help"/);
    assert.match(html, /\/api\/invoices\/in_paid\/pdf/);

    const pdf = await api.get(`${base}/api/invoices/in_paid/pdf`);
    assert.equal(pdf.status(), 200);
    assert.match(pdf.headers()["content-type"] || "", /application\/pdf/);
    const bytes = (await pdf.body()).toString("latin1");
    assert.match(bytes, /^%PDF/);
    assert.match(bytes, /PAID/);

    const missing = await api.get(`${base}/api/invoices/in_missing/pdf`);
    assert.equal(missing.status(), 404);

    try {
      const browser = await chromium.launch({ headless: true });
      const tab = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await tab.goto(`${base}/invoices`, { waitUntil: "domcontentloaded" });
      await tab.getByText("Paid", { exact: true }).waitFor();
      let shotDir = "";
      try {
        shotDir = "/opt/cursor/artifacts/screenshots";
        mkdirSync(shotDir, { recursive: true });
      } catch {
        shotDir = "";
      }
      if (shotDir) {
        await tab.screenshot({ path: `${shotDir}/invoices-list-390.png` });
        await tab.setViewportSize({ width: 1280, height: 800 });
        await tab.screenshot({ path: `${shotDir}/invoices-list-1280.png` });
      }
      const [download] = await Promise.all([
        tab.waitForEvent("download"),
        tab.locator('[data-invoice="in_paid"]').click(),
      ]);
      const saved = await download.path();
      assert.ok(saved);
      await browser.close();
      if (shotDir) t.diagnostic(`screenshots ${shotDir}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/Executable doesn't exist|browserType\.launch|Failed to launch/i.test(message)) throw err;
      t.diagnostic(`chromium not installed; request route check still ran`);
    }
  } finally {
    await api.dispose();
    await new Promise((resolve) => server.close(resolve));
  }
});
