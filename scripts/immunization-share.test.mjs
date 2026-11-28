import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SHARED_IMMUNIZATION_RECORDS_SQL, SHARE_IMMUNIZATION_SQL } from "../src/lib/immunization-share.ts";

test("linking a shared immunization file is child-specific, scoped, and reversible", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table children (id text primary key, user_id text, immunization_status text);
      create table family_documents (id text primary key, user_id text, kind text);
      create table family_document_shares (
        id text primary key, document_id text, daycare_id text, revoked_at timestamptz
      );
      create unique index open_share on family_document_shares (document_id, daycare_id) where revoked_at is null;
      create table immunization_files (id text primary key, child_id text, owner_user_id text, daycare_id text, kind text);
      create table bookings (child_id text, daycare_id text, status text);
      insert into children values ('child', 'parent', 'existing status'), ('sibling', 'parent', null), ('other', 'other-parent', null);
      insert into family_documents values ('file', 'parent', 'immunization'), ('subsidy', 'parent', 'subsidy');
      insert into bookings values ('child', 'centre', 'active'), ('sibling', 'centre', 'accepted');
    `);
    const share = (document, child, id) => pg.query(SHARE_IMMUNIZATION_SQL, [document, "centre", "parent", child, id]);
    assert.deepEqual((await share("file", "other", "wrong")).rows, []);
    assert.deepEqual((await share("subsidy", "child", "sub")).rows, []);
    assert.deepEqual((await share("file", "child", "share")).rows, [{ id: "share" }]);
    assert.deepEqual((await share("file", "child", "retry")).rows, [{ id: "share" }]);
    assert.deepEqual((await share("file", "sibling", "switch")).rows, []);
    const read = (actor, centres) => pg.query(SHARED_IMMUNIZATION_RECORDS_SQL, [["child", "sibling"], actor, centres]);
    assert.deepEqual((await read("staff", ["centre"])).rows, [{ child_id: "child" }]);
    assert.deepEqual((await read("staff", ["other-centre"])).rows, []);
    assert.deepEqual((await read("parent", [])).rows, [{ child_id: "child" }]);
    await pg.exec("update family_document_shares set revoked_at = now()");
    assert.deepEqual((await read("staff", ["centre"])).rows, []);
    const { rows } = await pg.query("select immunization_status from children where id = 'child'");
    assert.deepEqual(rows, [{ immunization_status: "existing status" }]);
  } finally {
    await pg.close();
  }
});
