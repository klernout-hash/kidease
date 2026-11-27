import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as scheduling from "../src/lib/staff-scheduling.ts";
import * as certificates from "../src/lib/staff-certs.ts";

test("roster owners see team records while staff keep assigned shifts, own certificates and room ratios", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table daycares(id text primary key, name text, province text);
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table "user"(id text primary key, name text, email text);
      create table staff_shifts(id text primary key, daycare_id text, staff_name text, staff_user_id text,
        role text, room_band text, starts_at timestamptz, ends_at timestamptz);
      create table ece_certificates(id text primary key, daycare_id text, staff_name text,
        province text, certificate_number text, level text, expires_on date, reminded_at timestamptz);
      create table wiring_notices(feature text, user_id text, mode text, body text, created_at timestamptz default now());
      insert into daycares values ('a','Synthetic Centre','MB'), ('b','Another Centre','MB');
      insert into provider_daycares values ('a','owner'), ('b','other-owner');
      insert into centre_members values ('a','staff','active','staff'),('a','manager','active','manager'),
        ('a','reader','active','read_only'),('a','revoked','revoked','owner'),('a','member-owner','active','owner');
      insert into staff_shifts values
        ('mine','a','Shared Display Name','staff','ece','preschool',now()-interval '1 hour',now()+interval '1 hour'),
        ('same-name','a','Shared Display Name','another-staff','ece','preschool',now()-interval '1 hour',now()+interval '1 hour'),
        ('unassigned','a','Shared Display Name',null,'ece','preschool',now()-interval '1 hour',now()+interval '1 hour');
      insert into ece_certificates values ('self','a','Synthetic Staff','MB','SYN1','ECE','2030-01-01',null),
        ('another','a','Synthetic Colleague','MB','SYN2','ECE','2030-01-01',null);
    `);
    await pg.query("insert into wiring_notices (feature,user_id,mode,body) values ($1,$2,$3,$4)", [
      certificates.ECE_CERT_LINK_FEATURE, "staff", "self",
      JSON.stringify({ certId: "self", daycareId: "a", staffUserId: "staff", fileRef: "synthetic-file" }),
    ]);
    const statuses = [];
    const sql = async (parts, ...params) => {
      const statement = parts.map((part, i) => (i ? `$${i}` : "") + part).join("");
      return (await pg.query(statement, params)).rows;
    };
    sql.query = async (statement, params) => (await pg.query(statement, params)).rows;
    const access = {
      loadCentreRole: async (_sql, user, daycare) => {
        const rows = await pg.query(`
          select 'owner' as role from provider_daycares where user_id=$1 and daycare_id=$2
          union select role from centre_members where user_id=$1 and daycare_id=$2 and status='active'
        `, [user, daycare]);
        return rows.rows[0]?.role ?? null;
      },
      daycareIdsForArea: async (_sql, user) => {
        const rows = await pg.query(`
          select daycare_id from provider_daycares where user_id=$1
          union select daycare_id from centre_members where user_id=$1 and status='active'
        `, [user]);
        return rows.rows.map(({ daycare_id }) => daycare_id);
      },
      assertStaffArea: async (_sql, user, daycare) => {
        if (!(await access.loadCentreRole(sql, user, daycare))) throw new Error("Not a centre member");
      },
    };
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    const common = {
      "@tanstack/react-start": { createServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (code) => statuses.push(code) },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/auth/middleware": {},
      "@/lib/server/centre-access": access,
      "@/lib/features": { staffSchedulingEnabled: () => true },
      "@/lib/staff-scheduling": scheduling,
      "@/lib/staff-certs": certificates,
      "@/lib/utils": {},
      "@/lib/private-docs": {},
      "@/lib/server/private-docs": {
        loadPrivateDoc: async (id) => {
          assert.equal(id, "synthetic-file");
          return { filename: "synthetic.pdf", mime: "application/pdf", body: new Uint8Array([42]) };
        },
      },
      "node:crypto": {},
    };
    function handlers(file) {
      const source = readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8");
      const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const exports = {};
      new Function("require", "exports", code)((id) => {
        assert.ok(id in common, id);
        return common[id];
      }, exports);
      return exports;
    }
    const roster = handlers("staff-scheduling");
    const cert = handlers("staff-certs");
    const invoke = (fn, userId, data = { daycareId: "a" }) => fn({ context: { userId }, data });
    const staff = await invoke(roster.listStaffDesk, "staff");
    assert.equal(staff.canManage, false);
    assert.deepEqual(staff.shifts.map(({ id }) => id), ["mine"]);
    assert.deepEqual(staff.certs, []);
    for (const role of ["staff", "reader", "manager", "revoked", "other-owner"]) {
      assert.equal((await invoke(roster.listStaffDesk, role)).canManage, role === "other-owner");
      assert.deepEqual((await invoke(cert.listCentreEceCerts, role)).certs, []);
      await assert.rejects(invoke(roster.saveStaffShift, role), /centre owner/);
      await assert.rejects(invoke(roster.saveEceCertificate, role), /centre owner/);
      await assert.rejects(invoke(cert.saveCentreEceCert, role), /centre owner/);
      await assert.rejects(invoke(cert.downloadEceCertFile, role, { certId: "another" }), /cannot open/);
    }
    for (const user of ["owner","member-owner"]) {
      const desk = await invoke(roster.listStaffDesk, user);
      assert.equal(desk.canManage, true);
      assert.equal(desk.shifts.length, 3);
      assert.equal(desk.certs.length, 2);
      assert.equal((await invoke(cert.listCentreEceCerts, user)).certs.length, 2);
    }
    assert.deepEqual((await invoke(cert.listMyEceCerts, "staff")).certs.map(({ id }) => id), ["self"]);
    assert.equal((await invoke(cert.downloadEceCertFile, "staff", { certId: "self" })).filename, "synthetic.pdf");
    const ratio = await invoke(roster.checkRoomRatio, "staff", { daycareId: "a", roomBand: "preschool", childrenPresent: 10 });
    assert.equal(ratio.staffOnShift, 3);
    assert.equal(ratio.childrenPresent, 10);
    assert.ok(statuses.length >= 24 && statuses.every((code) => code === 403));
  } finally {
    await pg.close();
  }
});
