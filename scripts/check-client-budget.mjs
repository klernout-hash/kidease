/**
 * Client JS budget from the production build on 21 Nov 2026:
 * 854 files, 4,173,126 bytes gzip. The caps sit just above that measure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const MAX_JS_FILES = 880;
const MAX_GZIP_BYTES = 4_250_000;

const roots = [
  ".vercel/output/static/assets",
  ".output/public/assets",
  "dist/client/assets",
];

function measure(dir) {
  const names = readdirSync(dir).filter((name) => name.endsWith(".js") && statSync(join(dir, name)).isFile());
  let gzip = 0;
  for (const name of names) gzip += gzipSync(readFileSync(join(dir, name))).length;
  return { files: names.length, gzip };
}

const dir = roots.find((path) => existsSync(path));
if (!dir) {
  console.error("Client assets were not found. Run the production build first.");
  process.exit(1);
}
const { files, gzip } = measure(dir);
console.log(`Client JS: ${files} files, ${gzip} bytes gzip (${dir}).`);
if (files > MAX_JS_FILES || gzip > MAX_GZIP_BYTES) {
  console.error(`Client JS is over the budget (${MAX_JS_FILES} files, ${MAX_GZIP_BYTES} bytes gzip).`);
  process.exit(1);
}
