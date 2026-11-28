import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  assignPendingCentreExport,
  completeOwnedCentreExport,
  listOwnedCentreExports,
} from "../src/lib/server/wiring/dsr-centre-task.ts";

test("assigned centre export tasks only", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const migrate = async (name) => db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8"));
  await migrate("0143_dsr_propagation");
  await db.exec(`
    create table daycares (id text primary key, name text not null);
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (user_id text, daycare_id text, role text, status text);
    insert into daycares values ('centre-1', 'Sample Centre'), ('centre-2', 'Other Centre');
    insert into provider_daycares values ('canonical-owner', 'centre-1'), ('other-owner', 'centre-2');
    insert into centre_members values ('membership-owner','centre-1','owner','active'),
      ('former-owner','centre-1','owner','revoked'), ('staff','centre-1','staff','active'),
      ('manager','centre-1','manager','active'), ('read-only','centre-1','read_only','active');
    insert into dsr_requests (id, user_id, kind, status, held) values
      ('export','private-parent','export','with_roles',0),
      ('no-task','private-parent','export','with_roles',0),
      ('closed','private-parent','export','done',0),
      ('ambiguous','private-parent','export','with_roles',0),
      ('deletion','private-parent','delete','with_roles',1);
    insert into dsr_tasks (id, request_id, role) values
      ('export-centre','export','provider'), ('export-admin','export','admin'),
      ('closed-centre','closed','provider'), ('ambiguous-a','ambiguous','provider'),
      ('ambiguous-b','ambiguous','provider'), ('deletion-centre','deletion','provider');
  `);
  await migrate("0235_dsr_centre_assignment");
  const sql = async (parts, ...values) => {
    const query = parts.reduce((acc, part, i) => acc + (i ? `$${i}` : "") + part, "");
    return (await db.query(query, values)).rows;
  };
  const assign = (requestId, centreId) => assignPendingCentreExport(sql, { actorId: "trusted-admin", requestId, centreId });
  await t.test("migration does not bind any legacy rows, and unknown, ambiguous, closed or deletion work cannot be bound", async () => {
    assert.deepEqual(await listOwnedCentreExports(sql, "canonical-owner"), []);
    for (const id of ["no-task", "ambiguous", "closed", "deletion", "missing"]) assert.equal(await assign(id, "centre-1"), false);
    assert.equal(await assign("export", "missing-centre"), false);
    assert.equal(await completeOwnedCentreExport(sql, "canonical-owner", "export-centre"), false);
  });
  await t.test("an explicit assignment cannot be overwritten and only current same-centre owners see its minimum metadata", async () => {
    assert.equal(await assign("export", "centre-1"), true);
    assert.equal(await assign("export", "centre-2"), false);
    const visible = [{ taskId: "export-centre", centreName: "Sample Centre" }];
    for (const actor of ["canonical-owner", "membership-owner"]) assert.deepEqual(await listOwnedCentreExports(sql, actor), visible);
    for (const actor of ["other-owner", "former-owner", "staff", "manager", "read-only", "private-parent"]) {
      assert.deepEqual(await listOwnedCentreExports(sql, actor), []);
      assert.equal(await completeOwnedCentreExport(sql, actor, "export-centre"), false);
    }
  });
  await t.test("completion rechecks current ownership and updates only the assigned centre task", async () => {
    await db.exec("update centre_members set status = 'revoked' where user_id = 'membership-owner'");
    assert.equal(await completeOwnedCentreExport(sql, "membership-owner", "export-centre"), false);
    assert.equal(await completeOwnedCentreExport(sql, "canonical-owner", "export-admin"), false);
    assert.equal(await completeOwnedCentreExport(sql, "canonical-owner", "export-centre"), true);
    assert.equal(await completeOwnedCentreExport(sql, "canonical-owner", "export-centre"), false);
    assert.deepEqual(await listOwnedCentreExports(sql, "canonical-owner"), []);
    const { rows } = await db.query(`
      select t.id, t.status, t.done_by, t.assigned_by, r.status as request_status
      from dsr_tasks t join dsr_requests r on r.id = t.request_id
      where r.id = 'export' order by t.id
    `);
    assert.deepEqual(rows, [
      { id: "export-admin", status: "open", done_by: null, assigned_by: null, request_status: "with_roles" },
      { id: "export-centre", status: "done", done_by: "canonical-owner", assigned_by: "trusted-admin", request_status: "with_roles" },
    ]);
  });
});
