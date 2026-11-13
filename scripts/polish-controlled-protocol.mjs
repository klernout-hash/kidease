/** Shared input validation for the snapshot-based iteration-3 collectors. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { assertFixtureValidity } from "./polish-fixture-lib.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function parseInput(bytes) {
  try {
    return JSON.parse(String(bytes));
  } catch {
    throw new Error("A controlled input is not valid JSON; contents were not logged.");
  }
}
const readJson = (path) => parseInput(readFileSync(path, "utf8"));
function loopbackOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Controlled fixture origins must be HTTP loopback only.");
  }
  return url.origin;
}
const inputPath = (value, parent) => {
  if (typeof value !== "string" || !value)
    throw new Error("A required fixture input path is missing.");
  return isAbsolute(value) ? value : resolve(parent, value);
};

export function loadControlledProtocol({
  manifestFile,
  phase,
  base,
  sourceSha,
  expectedHtmlEncoding,
}) {
  if (!["before", "after"].includes(phase)) throw new Error("Use --phase before or after.");
  if (!manifestFile)
    throw new Error("--fixture-manifest is required; per-navigation seeding is prohibited.");
  if (!["identity", "gzip", "br"].includes(expectedHtmlEncoding)) {
    throw new Error("An explicit HTML policy is required: --html-encoding identity, gzip or br.");
  }
  const manifestPath = resolve(manifestFile),
    parent = resolve(manifestPath, "..");
  const manifestBytes = readFileSync(manifestPath),
    manifest = parseInput(manifestBytes);
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported fixture manifest schema.");
  const validity = assertFixtureValidity(manifest);
  if (!/^[a-f0-9]{64}$/.test(manifest.snapshot?.sha256 || ""))
    throw new Error("Snapshot SHA256 is missing.");
  const declaration = manifest.phases?.[phase];
  if (
    !declaration ||
    loopbackOrigin(declaration.base) !== loopbackOrigin(base) ||
    declaration.sourceSha !== sourceSha
  ) {
    throw new Error(
      "The selected fixture phase must match the exact built source and loopback origin.",
    );
  }
  const proofPath = inputPath(declaration.fixtureProofFile, parent),
    proof = readJson(proofPath);
  if (proof.importedArchiveSHA !== manifest.snapshot.sha256)
    throw new Error("Imported fixture archive does not match the canonical snapshot.");
  if (proof.revision !== sourceSha || loopbackOrigin(proof.base) !== loopbackOrigin(base))
    throw new Error("Fixture proof source/origin does not match the built source.");
  if (
    !manifest.snapshot.fingerprint?.sha256 ||
    proof.initialFingerprint?.sha256 !== manifest.snapshot.fingerprint.sha256
  )
    throw new Error("Initial full-table fingerprint does not match the exported snapshot.");
  const contentPath = inputPath(manifest.contentProofFile, parent),
    content = readJson(contentPath);
  const selectedContent = content.phases?.[phase] || content;
  if (selectedContent.complete !== true || selectedContent.fullContentParity !== true) {
    throw new Error("Full selected-phase content parity must be proved before timing.");
  }
  const canonicalContentHash = content.canonicalContentHash || selectedContent.canonicalContentHash;
  if (!/^[a-f0-9]{64}$/.test(canonicalContentHash || ""))
    throw new Error("Canonical full-content hash is required.");
  if (
    selectedContent.sourceSha !== sourceSha ||
    loopbackOrigin(selectedContent.base) !== loopbackOrigin(base) ||
    selectedContent.contentHash !== canonicalContentHash ||
    proof.fullContentParity !== true ||
    proof.contentHash !== canonicalContentHash
  )
    throw new Error("Selected phase is not source-matched to the canonical full content.");
  const actualContentHash = sha256(
    JSON.stringify(
      (proof.results || []).map(({ role, locale, surface }) => ({ role, locale, surface })),
    ),
  );
  if (actualContentHash !== canonicalContentHash)
    throw new Error("Stored visible surfaces do not match their canonical content hash.");
  const archiveInput = manifest.privateArchiveFile || manifest.snapshot.archiveFile;
  const archiveFile = archiveInput ? inputPath(archiveInput, parent) : null;
  if (archiveFile && sha256(readFileSync(archiveFile)) !== manifest.snapshot.sha256)
    throw new Error("The canonical snapshot archive bytes changed.");
  const roles = new Map();
  for (const [role, state] of Object.entries(manifest.roles || {})) {
    const file = inputPath(state.storageStateFile, parent),
      bytes = readFileSync(file),
      digest = sha256(bytes);
    if (state.storageStateSha256 !== digest)
      throw new Error(`Captured ${role} state bytes changed or lack a proof hash.`);
    const storage = parseInput(bytes);
    if (!Array.isArray(storage.cookies) || !Array.isArray(storage.origins))
      throw new Error(`Invalid captured ${role} storage state.`);
    for (const cookie of storage.cookies) {
      if (!["127.0.0.1", "localhost"].includes(cookie.domain?.replace(/^\./, "")))
        throw new Error("Fixture cookies must remain loopback scoped.");
    }
    const normalized = {
      cookies: storage.cookies.map((cookie) => ({ ...cookie, domain: new URL(base).hostname })),
      origins: storage.origins.map((origin) => {
        loopbackOrigin(origin.origin);
        return { ...origin, origin: loopbackOrigin(base) };
      }),
    };
    roles.set(role, { state: normalized, sha256: digest });
  }
  if (!roles.has("guest")) throw new Error("An explicit guest state is required.");
  return {
    metadata: {
      schemaVersion: 1,
      phase,
      sourceSha,
      origin: loopbackOrigin(base),
      manifestSha256: sha256(manifestBytes),
      snapshotSha256: manifest.snapshot.sha256,
      canonicalArchiveBytesVerified: Boolean(archiveFile),
      initialFullTableFingerprintSha256: proof.initialFingerprint.sha256,
      fixtureProofSha256: sha256(readFileSync(proofPath)),
      contentProofSha256: sha256(readFileSync(contentPath)),
      canonicalContentHash,
      expectedSurfaceHashes: Object.fromEntries(
        proof.results.map((result) => [`${result.role}-${result.locale}`, result.surfaceHash]),
      ),
      expectedHtmlEncoding,
      validity,
      documentAccept: CONTROLLED_DOCUMENT_ACCEPT,
      acceptEncoding: CONTROLLED_ACCEPT_ENCODING,
      roleStateHashes: Object.fromEntries([...roles].map(([role, value]) => [role, value.sha256])),
      sessionPolicy:
        "Captured local role states only; no per-navigation seed or standalone get-session request. App navigation may refresh session timestamps; fixture owner records post-navigation changes separately.",
    },
    stateFor(role = "guest") {
      const value = roles.get(role);
      if (!value) throw new Error(`No captured ${role} state in the canonical snapshot inputs.`);
      return value.state;
    },
    expectedSurface(role, locale) {
      return (
        proof.results.find((result) => result.role === role && result.locale === locale) || null
      );
    },
    assertCurrentValidity() {
      return assertFixtureValidity(manifest);
    },
  };
}

export const CONTROLLED_ACCEPT_ENCODING = "gzip, deflate, br";
export const CONTROLLED_DOCUMENT_ACCEPT = "text/html";

export function sanitizeArtifact(value, key = "") {
  if (/headers/i.test(key)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "[redacted]";
    return Object.fromEntries(
      Object.entries(value).filter(([name]) =>
        /^(?:content-encoding|content-length|content-type|cache-control|vary|date|accept|accept-encoding|user-agent)$/i.test(
          name,
        ),
      ),
    );
  }
  if (/cookie|authorization|password|token|postData|requestBody/i.test(key)) return "[redacted]";
  if (typeof value === "string" && /url|documentURL/i.test(key)) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.origin + url.pathname : value;
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifact(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [name, sanitizeArtifact(item, name)]),
    );
  return value;
}

export async function installCapturedState(context, state, origin) {
  await context.addCookies(state.cookies);
  const localStorage = state.origins.flatMap((entry) => entry.localStorage || []);
  await context.addInitScript(
    ({ targetOrigin, entries }) => {
      if (location.origin !== targetOrigin) return;
      for (const item of entries) window.localStorage.setItem(item.name, item.value);
    },
    { targetOrigin: loopbackOrigin(origin), entries: localStorage },
  );
}

export function userAgentsFromVersion(version) {
  const desktop = version.userAgent;
  const reducedVersion = desktop?.match(/(?:Headless)?Chrome\/([\d.]+)/)?.[1];
  if (!reducedVersion) throw new Error("Actual Chrome user-agent version is unavailable.");
  return {
    desktop,
    mobile: `Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${reducedVersion} Mobile Safari/537.36`,
    browserProduct: version.product,
  };
}

export function htmlTransportFacts(headers, bodyBytes, expectedEncoding) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  const encoding = normalized["content-encoding"]?.toLowerCase().trim() || "identity";
  return {
    contentEncoding: encoding,
    encodingMatched: encoding === expectedEncoding,
    encodedContentLengthHeader: /^\d+$/.test(normalized["content-length"] || "")
      ? Number(normalized["content-length"])
      : null,
    decodedBodyBytes: bodyBytes,
    contentType: normalized["content-type"] || null,
  };
}
