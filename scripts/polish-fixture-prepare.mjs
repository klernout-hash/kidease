/** Once-only local seeding, then seed-free content-parity verification. */
import { chromium, request } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixtureCommand } from "./polish-fixture-control.mjs";
import {
  assertLocalFixtureEnvironment,
  assertFixtureValidity,
  changedFixtureTables,
  FIXTURE_PROTOCOL,
  FIXTURE_SEED_SEQUENCE,
  fixtureValidityFromState,
  isForbiddenFixturePath,
  privateDirectory,
  privateWrite,
  sha256,
} from "./polish-fixture-lib.mjs";
import { localAuditUrl } from "./polish-coverage.mjs";
import { waitForPolishReadiness } from "./polish-readiness.mjs";

/** Stable user-visible identities, order, counts, and text; no auth/session values. */
export function inspectFixtureSurface({ pageId }) {
  const text = (node) => (node?.innerText || "").replace(/\s+/g, " ").trim();
  const shown = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
  };
  const nodes = (selector, root = document) => [...root.querySelectorAll(selector)].filter(shown);
  const links = (root) => nodes("a[href]", root).map((node) => ({ text: text(node), href: node.getAttribute("href") }));
  if (pageId === "search") {
    const cards = nodes('.ke-search-results [data-slug],[data-ke="msv2-list"] [data-slug]');
    const seen = new Set();
    const orderedCards = cards.flatMap((node) => {
      const slug = node.getAttribute("data-slug");
      if (!slug || seen.has(slug)) return [];
      seen.add(slug);
      return [{ slug, text: text(node) }];
    });
    const countText = nodes('[data-ke="search-count"],[data-ke="msv2-count"]').map(text).join(" | ");
    return { pageId, countText, total: Number(countText.match(/[\d,]+/)?.[0].replaceAll(",", "")), renderedCards: orderedCards.length, orderedCards };
  }
  if (pageId === "parent") {
    const saved = document.querySelector('[data-ke="parent-home-saved"]');
    const waiting = document.querySelector('[data-ke="parent-home-waiting"]');
    return {
      pageId,
      savedRows: nodes("li", saved || document.createElement("div")).map((node) => ({ text: text(node), links: links(node) })),
      requestRows: nodes("ul > li", waiting || document.createElement("div")).map((node) => ({ text: text(node), links: links(node) })),
      requestSectionText: text(waiting),
    };
  }
  if (pageId === "admin") {
    return {
      pageId,
      stats: nodes('[data-ke="admin-stat"]').map(text),
      queueCards: nodes('[data-ke="admin-review-card"]').map((node) => ({ text: text(node), links: links(node) })),
      empty: nodes('[data-ke="admin-review-empty"]').map(text),
      errors: nodes('[data-ke="admin-review-error"],[data-ke="admin-centres-error"]').map(text),
      pending: nodes('[data-ke="admin-review-loading"],[aria-busy="true"]').length,
    };
  }
  if (pageId === "daycare") {
    const desk = document.querySelector('[data-ke="daycare-desk"]');
    return { pageId, text: text(desk), privateCentreLinks: desk ? links(desk) : [] };
  }
  const root = document.querySelector(pageId === "home" ? '[data-ke="home-discovery-surface"]' : '[data-ke="listing-name"]') || document.querySelector("main");
  return { pageId, text: text(root) };
}

export function normalizeFixtureState(state, base) {
  return {
    cookies: state.cookies.map((cookie) => ({ ...cookie })),
    origins: state.origins.map((origin) => ({ ...origin, origin: base })),
  };
}

async function installGuards(context, base, blocked) {
  await context.routeWebSocket("**", (socket) => { blocked.push("websocket"); socket.close(); });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["blob:", "data:"].includes(url.protocol)) return route.continue();
    const forbidden = isForbiddenFixturePath(url.pathname);
    if (url.origin !== base || forbidden) { blocked.push(forbidden ? "forbidden-health-or-status" : "external"); return route.abort("blockedbyclient"); }
    return route.continue();
  });
}

async function captureContent(browser, args, role, stateFile) {
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: "reduce", storageState: normalizeFixtureState(state, args.base) });
  const results = [];
  const blocked = [];
  try {
    await installGuards(context, args.base, blocked);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const pageId = { guest: "search", parent: "parent", provider: "daycare", admin: "admin" }[role];
    for (const locale of ["en", "fr"]) {
      const path = role === "admin" ? (locale === "fr" ? "/admin?lang=fr" : "/admin") : `${locale === "fr" ? "/fr" : ""}/${{ guest: "search", parent: "parent", provider: "provider" }[role]}`;
      const response = await page.goto(new URL(path, args.base).href, { waitUntil: "domcontentloaded", timeout: 45000 });
      const ready = await waitForPolishReadiness(page, { pageId });
      if (!ready.ready || !ready.healthy || response?.status() !== 200 || new URL(page.url()).pathname !== new URL(path, args.base).pathname)
        throw new Error(`${role}/${locale} failed strict loaded-content readiness.`);
      if (role === "admin") await page.locator('[data-ke="admin-review-loading"]').waitFor({ state: "hidden", timeout: 25000 });
      const surface = await page.evaluate(inspectFixtureSurface, { pageId });
      if (pageId === "search" && (!surface.total || surface.renderedCards !== ready.uniqueListingCount))
        throw new Error("Search total/card identity proof is incomplete.");
      if (pageId === "search" && surface.renderedCards !== 96)
        throw new Error("This controlled fixture expects exactly96rendered search-card identities; no scope substitution is allowed.");
      if (pageId === "admin" && (surface.pending || surface.errors.length || !surface.stats.length || (!surface.queueCards.length && !surface.empty.length)))
        throw new Error("Admin queue/count proof is incomplete.");
      results.push({ role, locale, path, readiness: ready, surface, surfaceHash: sha256(JSON.stringify(surface)), pageErrors: [...pageErrors] });
    }
    return { results, finalState: await context.storageState(), blocked };
  } finally { await context.close(); }
}

async function run() {
  const args = { action: "", base: "", socket: "", "private-dir": "", out: "", revision: "", chrome: "", phase: "" };
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index].replace(/^--/, "");
    if (!(key in args) || !process.argv[index + 1]) throw new Error("Unsupported or missing fixture argument.");
    args[key] = process.argv[index + 1];
  }
  if (!["prepare", "verify"].includes(args.action) || !/^[a-f0-9]{40}$/.test(args.revision)) throw new Error("Use --action prepare|verify and a full --revision.");
  assertLocalFixtureEnvironment();
  args.base = localAuditUrl(args.base);
  const privateDir = privateDirectory(args["private-dir"]);
  args.out = resolve(args.out);
  mkdirSync(args.out, { recursive: true });
  const control = await fixtureCommand(args.socket, { action: "status" });
  if (control.revision !== args.revision) throw new Error("The fixture process source revision does not match.");
  if ((args.action === "prepare") === Boolean(control.importedArchiveSHA)) throw new Error("Prepare needs a fresh seed process; verify needs an imported process.");
  const manifestFile = resolve(args.out, "fixture-manifest.json");
  const canonicalFile = resolve(args.out, "canonical-content.json");
  let manifest;
  if (args.action === "prepare") {
    if (existsSync(manifestFile)) throw new Error("Fixture manifest exists; never reseed a prepared fixture.");
    privateWrite(resolve(privateDir, "preparation-started.json"), JSON.stringify({ revision: args.revision, startedAt: new Date().toISOString(), seedSequence: FIXTURE_SEED_SEQUENCE }));
    privateWrite(resolve(privateDir, "guest-state.json"), JSON.stringify({ cookies: [], origins: [] }));
    for (const body of FIXTURE_SEED_SEQUENCE) {
      const client = await request.newContext({ baseURL: args.base });
      try {
        const response = await client.post("/api/e2e-seed", { data: body, headers: { origin: args.base }, maxRedirects: 0 });
        if (!response.ok()) throw new Error(`Once-only local ${body.role} seed failed with HTTP${response.status()}.`);
        const state = await client.storageState();
        const pair = response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie").map((header) => header.value.split(";")[0]).find((value) => value.includes("session_token="));
        if (pair) state.cookies.push({ name: "kidease.e2e_session", value: decodeURIComponent(pair.slice(pair.indexOf("=") + 1)), domain: new URL(args.base).hostname, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" });
        privateWrite(resolve(privateDir, `${body.role}-state.json`), JSON.stringify(state));
      } finally { await client.dispose(); }
    }
  } else {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    assertFixtureValidity(manifest);
    const adminStateBytes = readFileSync(manifest.roles.admin.storageStateFile);
    if (sha256(adminStateBytes) !== manifest.roles.admin.storageStateSha256)
      throw new Error("Captured admin state bytes changed; expiry must not be rewritten.");
    const capturedValidity = fixtureValidityFromState(JSON.parse(adminStateBytes), Date.parse(manifest.validity.preparedAt));
    if (capturedValidity.adminIdleExpiresEpochMs !== manifest.validity.adminIdleExpiresEpochMs)
      throw new Error("Manifest expiry differs from the unchanged captured admin state.");
    if (control.importedArchiveSHA !== manifest.snapshot.sha256) throw new Error("The imported archive is not the canonical snapshot.");
    if (control.initialFingerprint?.sha256 !== manifest.snapshot.fingerprint.sha256)
      throw new Error("Imported full-table fingerprints do not match the canonical snapshot.");
    if (!["before", "after"].includes(args.phase)) throw new Error("Verify needs --phase before|after.");
  }
  const browser = await chromium.launch({ headless: true, ...(args.chrome ? { executablePath: args.chrome } : {}) });
  let results = [];
  let prior;
  try {
    prior = await fixtureCommand(args.socket, { action: "fingerprint" });
    // No browser request can reseed. Roles are checked serially against one state.
    for (const role of ["guest", "parent", "provider", "admin"]) {
      const stateFile = resolve(privateDir, `${role}-state.json`);
      const captured = await captureContent(browser, args, role, stateFile);
      results.push(...captured.results);
      // Persist final synthetic cookies only during initial fixture preparation.
      if (args.action === "prepare") writeFileSync(stateFile, JSON.stringify(captured.finalState), { mode: 0o600 });
    }
  } finally { await browser.close(); }
  const post = await fixtureCommand(args.socket, { action: "fingerprint" });
  const changes = changedFixtureTables(prior.fingerprint, post.fingerprint);
  const contentHash = sha256(JSON.stringify(results.map(({ role, locale, surface }) => ({ role, locale, surface }))));
  if (args.action === "prepare") {
    writeFileSync(canonicalFile, JSON.stringify({ protocol: FIXTURE_PROTOCOL, canonicalContentHash: contentHash, results, navigationTableChanges: changes }, null, 2) + "\n", { flag: "wx" });
    const snapshotFile = resolve(privateDir, "canonical-pglite.tgz");
    const exported = await fixtureCommand(args.socket, { action: "export", path: snapshotFile });
    manifest = {
      schemaVersion: 1, protocol: FIXTURE_PROTOCOL, snapshot: { sha256: exported.snapshot.sha256, bytes: exported.snapshot.bytes, fingerprint: exported.snapshot.fingerprint },
      privateArchiveFile: snapshotFile,
      roles: Object.fromEntries(["guest", "parent", "provider", "admin"].map((role) => { const storageStateFile = resolve(privateDir, `${role}-state.json`); return [role, { storageStateFile, storageStateSha256: sha256(readFileSync(storageStateFile)) }]; })),
      phases: {}, contentProofFile: resolve(args.out, "content-proof.json"), canonicalContentFile: canonicalFile,
      seedSequence: FIXTURE_SEED_SEQUENCE, preparationSourceSha: args.revision,
      privateFilesMustNotBePublished: true,
      validity: fixtureValidityFromState(JSON.parse(readFileSync(resolve(privateDir, "admin-state.json"), "utf8"))),
    };
    assertFixtureValidity(manifest);
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    writeFileSync(manifest.contentProofFile, JSON.stringify({ canonicalContentHash: contentHash, phases: {} }, null, 2) + "\n", { flag: "wx" });
  } else {
    const validityCheck = assertFixtureValidity(manifest);
    const canonical = JSON.parse(readFileSync(canonicalFile, "utf8"));
    const matched = canonical.canonicalContentHash === contentHash;
    const proofFile = resolve(args.out, `${args.phase}-fixture-proof.json`);
    const phaseProof = { protocol: FIXTURE_PROTOCOL, revision: args.revision, base: args.base, importedArchiveSHA: control.importedArchiveSHA, initialFingerprint: control.initialFingerprint, preNavigationFingerprint: prior.fingerprint, postNavigationFingerprint: post.fingerprint, navigationTableChanges: changes, fullContentParity: matched, contentHash, validityCheck, results };
    writeFileSync(proofFile, JSON.stringify(phaseProof, null, 2) + "\n", { flag: "wx" });
    const proof = JSON.parse(readFileSync(manifest.contentProofFile, "utf8"));
    proof.phases[args.phase] = { complete: true, fullContentParity: matched, sourceSha: args.revision, base: args.base, contentHash, proofFile };
    manifest.phases[args.phase] = { base: args.base, sourceSha: args.revision, fixtureProofFile: proofFile };
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    writeFileSync(manifest.contentProofFile, JSON.stringify(proof, null, 2) + "\n");
    if (!matched) throw new Error("Visible fixture content differs from canonical; no benchmark may run.");
  }
  console.log(JSON.stringify({ action: args.action, phase: args.phase || null, complete: true, canonicalContentHash: contentHash, manifest: manifestFile, changedTableNames: changes.map((table) => table.name), privateValuesReported: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
