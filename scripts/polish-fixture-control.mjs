import { createConnection } from "node:net";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function fixtureCommand(socket, command) {
  return new Promise((resolveCommand, reject) => {
    const connection = createConnection(socket);
    let output = "";
    connection.setTimeout(65000, () => { connection.destroy(); reject(new Error("Fixture command timed out.")); });
    connection.once("connect", () => connection.write(JSON.stringify(command) + "\n"));
    connection.on("data", (chunk) => { output += chunk.toString(); });
    connection.once("error", reject);
    connection.once("end", () => {
      try {
        const result = JSON.parse(output);
        if (!result.ok) throw new Error(result.error);
        resolveCommand(result);
      } catch (error) { reject(error); }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) args[process.argv[index].replace(/^--/, "")] = process.argv[index + 1];
  if (!args.socket || !["status", "fingerprint", "export"].includes(args.action))
    throw new Error("Use --socket PATH --action status|fingerprint|export [--path PRIVATE_ARCHIVE] [--out PUBLIC_PROOF_JSON].");
  const result = await fixtureCommand(args.socket, { action: args.action, path: args.path });
  if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ok: true, action: args.action, revision: result.revision, importedArchiveSHA: result.importedArchiveSHA, fingerprintSHA: result.fingerprint?.sha256 || result.initialFingerprint?.sha256 || result.snapshot?.fingerprint.sha256, snapshotSHA: result.snapshot?.sha256, proofWritten: Boolean(args.out) }));
}
