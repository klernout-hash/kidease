import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = (file) => readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8");

test("compliance reads and writes intersect owner/manager access with the relevant grant", () => {
  assert.match(source("compliance-common"), /listOwnerOrManagerDaycareIds\(sql, userId\)/);
  assert.match(source("compliance-common"), /daycareIdsForArea\(sql, userId, area, need\)/);
  assert.match(source("compliance-common"), /managed\.filter\(\(id\) => allowed\.has\(id\)\)/);
  for (const [file, area] of Object.entries({
    calendar: "calendar", fees: "bills", funding: "bills",
    incidents: "children", ratios: "children", screening: "documents",
  })) {
    const text = source(`compliance-${file}`);
    assert.ok(text.includes(`"${area}", "view")`), file);
    assert.ok(text.includes(`"${area}", "edit")`), file);
  }
});

test("financial recipients exclude plain staff and inactive managers", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table provider_daycares (user_id text, daycare_id text);
      create table centre_members (user_id text, daycare_id text, status text, role text);
      insert into provider_daycares values ('owner', 'one'), ('other-owner', 'two');
      insert into centre_members values
        ('manager', 'one', 'active', 'manager'),
        ('staff', 'one', 'active', 'staff'),
        ('past', 'one', 'revoked', 'manager');
    `);
    const template = source("wiring/runtime").match(/select user_id from provider_daycares[\s\S]+?(?=`)/)?.[0];
    assert.ok(template);
    const query = template.replaceAll("${daycareId}", "$1").replaceAll("${audience}", "$2");
    const recipients = async (audience) => {
      const { rows } = await pg.query(query, ["one", audience]);
      return rows.map((row) => row.user_id).sort();
    };
    assert.deepEqual(await recipients("financial"), ["manager", "owner"]);
    assert.deepEqual(await recipients("all"), ["manager", "owner", "staff"]);
    assert.match(source("wiring/withdrawal"), /daycareUserIds\([^)]*, "financial"\)/);
  } finally {
    await pg.close();
  }
});
