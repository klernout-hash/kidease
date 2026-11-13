/** QA-only Node --import hook. Never included in the app bundle or deployed. */
import { createServer } from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { isMainThread } from "node:worker_threads";
import { Server } from "node:http";
import {
  assertLocalFixtureEnvironment,
  exportFixtureSnapshot,
  fingerprintDatabase,
  FIXTURE_PROTOCOL,
  importFixtureSnapshot,
  privateAuthKey,
  privateDirectory,
} from "./polish-fixture-lib.mjs";

if (isMainThread) {
  assertLocalFixtureEnvironment();
  const root = privateDirectory(process.env.POLISH_FIXTURE_PRIVATE_DIR || "");
  const socket = resolve(process.env.POLISH_FIXTURE_SOCKET || "");
  const authFile = resolve(process.env.POLISH_FIXTURE_AUTH_FILE || "");
  if (!socket.startsWith(root + sep) || !authFile.startsWith(root + sep) || socket.length > 100)
    throw new Error("Use short absolute socket/auth paths inside the private fixture directory.");
  if (existsSync(socket)) throw new Error("Fixture control socket already exists; do not share a process socket.");
  const revision = process.env.POLISH_FIXTURE_REVISION || "";
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Record the full served source revision.");
  globalThis.__grokAuthPreviewSecret__ = privateAuthKey(authFile);
  const importedArchiveSHA = process.env.POLISH_FIXTURE_IMPORT_SHA || null;
  let initialFingerprint = null;
  if (process.env.POLISH_FIXTURE_IMPORT) {
    const archive = resolve(process.env.POLISH_FIXTURE_IMPORT);
    if (!archive.startsWith(root + sep)) throw new Error("Import only a canonical archive from the private fixture directory.");
    const pg = await importFixtureSnapshot(archive, importedArchiveSHA);
    globalThis.__pgliteInstance__ = Promise.resolve(pg);
    initialFingerprint = await fingerprintDatabase(pg);
    // Measurement clones cannot accidentally run the mutating seed route.
    const originalEmit = Server.prototype.emit;
    Server.prototype.emit = function (event, ...args) {
      if (event === "request") {
        const [request, response] = args;
        let path = String(request.url || "").split("?")[0];
        try { path = decodeURIComponent(path).replace(/\/+/g, "/").replace(/\/+$/, ""); } catch { /* match raw path */ }
        if (path === "/api/e2e-seed") {
          response.writeHead(409, { "content-type": "text/plain", "cache-control": "no-store" });
          response.end("The imported QA fixture is sealed; reseeding is forbidden.");
          return true;
        }
      }
      return originalEmit.call(this, event, ...args);
    };
  } else if (importedArchiveSHA) {
    throw new Error("Import SHA supplied without an archive.");
  }
  const proof = () => ({
    protocol: FIXTURE_PROTOCOL,
    revision,
    pid: process.pid,
    importedArchiveSHA,
    initialFingerprint,
    database: "disposable-memory-pglite",
    authKeyShared: true,
    credentialsReported: false,
  });
  let chain = Promise.resolve();
  const server = createServer((connection) => {
    let input = "";
    connection.setTimeout(60000, () => connection.destroy());
    connection.on("data", (chunk) => {
      input += chunk.toString();
      if (input.length > 4096) return connection.destroy();
      if (!input.includes("\n")) return;
      connection.removeAllListeners("data");
      chain = chain.catch(() => {}).then(async () => {
        try {
          const command = JSON.parse(input.split("\n")[0]);
          if (!["status", "fingerprint", "export"].includes(command.action)) throw new Error("Unsupported fixture command.");
          const pg = await globalThis.__pgliteInstance__;
          if (!pg) throw new Error("App PGlite is not initialized; warm the authorized app route first.");
          await globalThis.__pgliteMigrateChain__;
          let result = proof();
          if (command.action === "fingerprint") result = { ...result, fingerprint: await fingerprintDatabase(pg) };
          if (command.action === "export") {
            if (importedArchiveSHA) throw new Error("An imported measurement process may not export/reseed the fixture.");
            const target = resolve(command.path || "");
            if (!target.startsWith(root + sep) || dirname(target) !== root)
              throw new Error("Export only directly into this private fixture directory.");
            result = { ...result, snapshot: await exportFixtureSnapshot(pg, target) };
          }
          connection.end(JSON.stringify({ ok: true, ...result }) + "\n");
        } catch (error) {
          connection.end(JSON.stringify({ ok: false, error: error.message }) + "\n");
        }
      });
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(socket, () => { chmodSync(socket, 0o600); resolveListen(); });
  });
  server.unref();
  process.once("exit", () => { if (existsSync(socket)) unlinkSync(socket); });
}
