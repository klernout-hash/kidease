import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("session desks are fetched once and shared", () => {
  const provider = src("src/components/session-desks.tsx");
  assert.match(provider, /SessionDesksProvider/);
  assert.match(provider, /getMyDesks/);
  assert.match(provider, /writeStickyDesk/);
  assert.match(provider, /setSticky/);
  assert.match(src("src/lib/desks.ts"), /localStorage\.setItem\(STICKY_DESK_KEY/);
  assert.match(src("src/lib/desks.ts"), /localStorage\.removeItem\(STICKY_DESK_KEY/);
  const auth = src("src/lib/auth/provider.tsx");
  assert.match(auth, /SessionDesksProvider/);
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /from "@\/components\/session-desks"/);
  assert.doesNotMatch(switcher, /getMyDesks/);
  const client = src("src/lib/auth/client.ts");
  assert.match(client, /clearStickyDesk/);
});

test("login preserves ?desk= and does not rewrite Better Auth cookies", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /parseDeskQuery/);
  assert.match(login, /writeStickyDesk/);
  assert.match(login, /resolvePostLoginPath/);
  assert.match(login, /deskQueryValue/);
  assert.doesNotMatch(login, /sessionStorage\.setItem\("better-auth/);
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(gates, /deskQueryValue/);
  assert.match(gates, /loginRoleFromDesk/);
  assert.match(gates, /parseDeskQuery/);
});

test("admin desk stays gated by profiles.role + owner email", () => {
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /isKidEaseOperatorEmail/);
  assert.match(roles, /kyle@kidease\.ca/);
  assert.match(roles, /bootstrapEmail/);
  assert.match(roles, /assertAdminDesk/);
  assert.match(roles, /requireAdmin/);
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /canVisitDesk\(session\.desks, "admin", session\.role, session\.email\)/);
  assert.match(admin, /beforeLoadAdminDesk/);
  assert.match(admin, /profiles\.role = admin/);
  assert.match(admin, /Not found/);
  assert.match(src("src/routes/admin-chat.tsx"), /beforeLoadAdminDesk/);
  assert.match(src("src/routes/admin-contracts.tsx"), /beforeLoadAdminDesk/);
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /headerDesks\(session\.desks, session\.role, session\.email\)/);
  assert.match(switcher, /showDeskSwitcher\(session\.desks, session\.role, session\.email\)/);
  assert.match(switcher, /do not call setRole/);
  assert.match(switcher, /deskSwitcherLabel/);
  assert.match(switcher, /aria-haspopup="menu"/);
  assert.match(switcher, /md:hidden/);
  assert.match(src("src/components/shell.tsx"), /canSeeAdminDesk\(session\?\.role, session\?\.email/);
  assert.match(src("src/components/shell.tsx"), /desksSlot/);
  assert.match(src("src/components/session-desks.tsx"), /sanitizeStickyDesk/);
  assert.match(src("src/components/session-desks.tsx"), /canVisitDesk/);
  assert.match(src("src/routes/index.tsx"), /homeLandPath/);
});
