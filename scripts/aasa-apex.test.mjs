import assert from "node:assert/strict";
import { test } from "node:test";
import { apexAasaResponse, isApexAasaRequest } from "../cloudflare/aasa-apex.js";

test("apex AASA worker only answers the association paths", () => {
  assert.equal(isApexAasaRequest("https://kidease.ca/.well-known/apple-app-site-association"), true);
  assert.equal(isApexAasaRequest("https://kidease.ca/.well-known/apple-app-site-association.json"), true);
  assert.equal(isApexAasaRequest("https://kidease.ca/apple-app-site-association", "HEAD"), true);
  assert.equal(isApexAasaRequest("https://www.kidease.ca/.well-known/apple-app-site-association"), false);
  assert.equal(isApexAasaRequest("https://kidease.ca/login"), false);
  assert.equal(isApexAasaRequest("https://kidease.ca/.well-known/apple-app-site-association", "POST"), false);
});

test("apex AASA worker returns www JSON with status 200", async () => {
  const body = '{"applinks":{}}\n';
  const response = await apexAasaResponse(
    new Request("https://kidease.ca/.well-known/apple-app-site-association"),
    async (url, init) => {
      assert.equal(url, "https://www.kidease.ca/.well-known/apple-app-site-association");
      assert.equal(init.redirect, "manual");
      return new Response(body, {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
      });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(await response.text(), body);
});

test("apex AASA worker does not follow a www redirect", async () => {
  const response = await apexAasaResponse(
    new Request("https://kidease.ca/.well-known/apple-app-site-association"),
    async () => new Response(null, { status: 308, headers: { location: "https://www.kidease.ca/.well-known/apple-app-site-association" } }),
  );
  assert.equal(response.status, 502);
});
