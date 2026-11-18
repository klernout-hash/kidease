import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

// Deliberate allowlist: no aggregate test discovery and no financial fixtures.
export const DESK_NONPAYMENT_TESTS = [
  "scripts/admin-desk-nav.test.mjs",
  "scripts/admin-idle-fresh.test.mjs",
  "scripts/admin-stat-filter.test.mjs",
  "scripts/admin-decision-auth.test.mjs",
  "scripts/admin-centres-load.test.mjs",
  "scripts/admin-queue-sort.test.mjs",
  "scripts/listing-queue.test.mjs",
  "scripts/license-photo-ref.test.mjs",
  "scripts/approve-live-trust.test.mjs",
  "scripts/canada-desk.test.mjs",
  "scripts/listing-incomplete.test.mjs",
  "scripts/listing-health-trust.test.mjs",
  "scripts/profile-health.test.mjs",
  "scripts/admin-queue-bootstrap.test.mjs",
  "scripts/admin-queue-route.test.mjs",
  "scripts/admin-centre-queue.test.mjs",
  "scripts/admin-queue-bootstrap-client.test.mjs",
];

const command = process.argv[2];
if (readdirSync(process.cwd()).some((name) => name.startsWith(".env") && name !== ".env.example")) {
  throw new Error(
    "Local checks refuse dotenv files; use this isolated checkout without production configuration.",
  );
}
const env = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
if (["tests", "parent-ui"].includes(command) && !existsSync(".vercel/output/static/assets")) {
  throw new Error("Run the clean build first; synthetic UI checks need its compiled styles.");
}
const args =
  command === "parent-ui"
    ? ["--experimental-strip-types", "scripts/parent-navigation.browser.mjs"]
    : command === "tests"
      ? ["--experimental-strip-types", "--test", "--test-concurrency=2", ...DESK_NONPAYMENT_TESTS]
      : ["run", command];
if (!["tests", "parent-ui", "typecheck", "lint", "build"].includes(command)) {
  throw new Error("Choose tests, parent-ui, typecheck, lint or build.");
}
const child = spawn(["tests", "parent-ui"].includes(command) ? process.execPath : "npm", args, {
  env,
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
