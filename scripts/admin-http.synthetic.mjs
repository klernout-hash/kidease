import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

// Only these two disposable processes may enable the dormant flag. Never load
// dotenv, inherit service credentials, start the client app or discover tests.
if (readdirSync(process.cwd()).some((name) => name.startsWith(".env") && name !== ".env.example"))
  throw new Error("Synthetic HTTP checks refuse dotenv files.");
if (!existsSync(".vercel/output/functions/__server.func/index.mjs"))
  throw new Error("Run the clean build before the synthetic HTTP checks.");
const baseEnv = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
for (const enabled of [false, true]) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "scripts/fixtures/admin-http-instance.mjs"],
      {
        env: {
          ...baseEnv,
          BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
          FEATURE_ADMIN_QUEUE_SSR: enabled ? "1" : "0",
        },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) {
    process.exitCode = code ?? 1;
    break;
  }
}
