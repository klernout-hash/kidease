/**
 * Point this clone at the repo hooks. npm ci runs this, including inside CI
 * containers that do not have a git checkout, so a missing git dir is a skip.
 */
import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { stdio: "ignore" });
}

try {
  git(["rev-parse", "--is-inside-work-tree"]);
} catch {
  process.exit(0);
}

try {
  git(["config", "core.hooksPath", ".githooks"]);
} catch {
  process.exit(0);
}
