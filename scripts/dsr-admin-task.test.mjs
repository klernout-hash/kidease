import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { completeAdminDsrTask } from "../src/lib/server/wiring/dsr-admin-task.ts";

test("Data Requests completion preserves unassigned work and restricts the Admin action", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(new URL("../migrations/0143_dsr_propagation.sql", import.meta.url), "utf8"));
  await db.exec(`
    create table profiles (user_id text primary key, role text not null);
    insert into profiles values ('admin-1', 'admin'), ('owner-1', 'provider'),
      ('staff-1', 'provider'), ('parent-1', 'parent');
    insert into dsr_requests (id, user_id, kind, status, held) values
      ('request-legacy', 'parent-1', 'export', 'with_roles', 0),
      ('request-admin', 'parent-1', 'export', 'with_roles', 0),
      ('request-held', 'parent-1', 'delete', 'blocked', 1);
    insert into dsr_tasks (id, request_id, role) values
      ('task-1', 'request-legacy', 'admin'), ('task-2', 'request-legacy', 'provider'),
      ('task-3', 'request-legacy', 'government'), ('task-4', 'request-admin', 'admin'),
      ('task-5', 'request-held', 'admin');
  `);
  const queries = [];
  const sql = async (parts, ...values) => {
    const query = parts.reduce((acc, part, i) => acc + (i ? `$${i}` : "") + part, "");
    queries.push(query);
    return (await db.query(query, values)).rows;
  };

  await t.test("non-admin roles and missing accounts never read or mutate a request", async () => {
    for (const actor of ["owner-1", "staff-1", "parent-1", "unknown"]) {
      for (const id of ["request-legacy", "unknown"]) {
        queries.length = 0;
        assert.deepEqual(await completeAdminDsrTask(sql, actor, id), { ok: false, error: "forbidden" });
        assert.equal(queries.length, 1);
        assert.match(queries[0], /from profiles/);
      }
    }
  });

  await t.test("Admin marks only its own task; the request remains open for other roles", async () => {
    assert.deepEqual(await completeAdminDsrTask(sql, "admin-1", "request-legacy"), { ok: true, status: "with_roles" });
    const { rows } = await db.query("select role, status, done_by from dsr_tasks where request_id = 'request-legacy' order by role");
    assert.deepEqual(rows, [
      { role: "admin", status: "done", done_by: "admin-1" },
      { role: "government", status: "open", done_by: null },
      { role: "provider", status: "open", done_by: null },
    ]);
  });

  await t.test("Admin-only requests can still finish; held deletion and unknown IDs cannot", async () => {
    assert.deepEqual(await completeAdminDsrTask(sql, "admin-1", "request-admin"), { ok: true, status: "done" });
    assert.deepEqual(await completeAdminDsrTask(sql, "admin-1", "request-held"), { ok: false, error: "hold" });
    assert.deepEqual(await completeAdminDsrTask(sql, "admin-1", "unknown"), { ok: false, error: "missing" });
    const { rows } = await db.query("select status, done_by from dsr_tasks where id = 'task-5'");
    assert.deepEqual(rows, [{ status: "open", done_by: null }]);
  });
});
