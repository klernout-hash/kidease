import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { leadsPageSearch } from "../src/lib/centre-leads.ts";
import { MONEY_TOOL_IDS, toolsForBillAccess } from "../src/lib/centre-tools.ts";
import { accountDeskParam, accountSearch, deskQueryForViewer, parseDeskQuery } from "../src/lib/desks.ts";
import { STAFF_GRANTS } from "../src/lib/staff-permissions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const provider = readFileSync(join(root, "src/routes/provider.tsx"), "utf8");
const tools = readFileSync(join(root, "src/lib/server/centre-tools.ts"), "utf8");
const menu = readFileSync(join(root, "src/routes/menu.tsx"), "utf8");

test("staff bill view does not open billing, payroll, or payout tools", () => {
  // B05: the staff preset has no bills access at all now. A custom "view" grant still hides money tools.
  assert.equal(STAFF_GRANTS.bills, "none");
  const visible = toolsForBillAccess(
    ["meals", ...MONEY_TOOL_IDS],
    false,
  );
  assert.deepEqual(visible, ["meals"]);
  for (const id of MONEY_TOOL_IDS) assert.equal(visible.includes(id), false);
  assert.deepEqual(toolsForBillAccess(["payroll", "meals"], true), ["payroll", "meals"]);
});

test("staff account links say staff, and that alias still opens the daycare desk", () => {
  assert.equal(deskQueryForViewer("provider", "staff"), "staff");
  assert.equal(deskQueryForViewer("provider", "read_only"), "staff");
  assert.equal(deskQueryForViewer("provider", "owner"), "director");
  assert.equal(parseDeskQuery("staff"), "provider");
  assert.deepEqual(accountSearch("provider", "staff"), { tab: "profile", desk: "staff" });
  assert.equal(accountDeskParam("staff"), "staff");
  assert.equal(accountDeskParam("director"), "director");
});

test("families link does not add an empty daycare id", () => {
  assert.deepEqual(leadsPageSearch({}), {});
  assert.deepEqual(leadsPageSearch({ daycareId: "  " }), {});
  assert.deepEqual(leadsPageSearch({ daycareId: "centre-1" }), { daycareId: "centre-1" });
});

test("money and documents stay on their own pages", () => {
  assert.doesNotMatch(provider, /desk: "today"/);
  assert.match(provider, /providerDocumentsEntry\(\{[\s\S]*?canViewDocuments,/);
  assert.equal(provider.split("<CentreDocumentChecklist").length - 1, 1);
  assert.match(provider, /documents\?\.kind === "forbidden"/);
});

test("bill and tap saves require bill edit, not a meal-plan write", () => {
  assert.match(tools, /assertStaffArea\(sql, context\.userId, data\.daycareId, "bills", "edit"\)/);
  assert.match(tools, /toolsForBillAccess/);
  assert.match(menu, /owns \? loadHostEarnings/);
});
