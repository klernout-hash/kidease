import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as ece from "../src/lib/ece-jobs.ts";
import * as gap from "../src/lib/gap-features.ts";

test("legacy ECE hiring uses current ownership for posts, applicants and their updates", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table daycares(id text primary key, name text, city text, slug text,
        visibility text default 'public', is_test int default 0, is_demo int default 0);
      create table "user"(id text primary key, name text, email text);
      insert into "user" values ('staff','Synthetic Applicant','staff@example.invalid');
      create table centre_job_posts(id text primary key, daycare_id text, user_id text, role text,
        note text, status text default 'open', created_at timestamptz default now());
      create table job_applications(id text primary key, job_id text, daycare_id text,
        name text, email text, note text, user_id text, status text default 'new', created_at timestamptz default now(),
        unique (job_id,user_id));
      insert into daycares (id,name,city,slug) values
        ('a','Synthetic Centre A','Test City','centre-a'),('b','Synthetic Centre B','Test City','centre-b');
      insert into provider_daycares values ('a','owner'), ('b','other-owner');
      insert into centre_members values ('a','staff','active','staff'), ('a','reader','active','read_only'),
        ('a','manager','active','manager'), ('a','past-owner','revoked','owner'),
        ('a','secondary-owner','active','owner'), ('b','owner','active','staff');
      insert into centre_job_posts (id, daycare_id, user_id, role)
        values ('job-a','a','owner','ECE'), ('job-b','b','other-owner','Assistant');
      insert into job_applications (id, job_id, daycare_id, name, email)
        values ('app-a','job-a','a','Fake Applicant A','a@example.invalid'),
               ('app-b','job-b','b','Fake Applicant B','b@example.invalid');
    `);
    const statuses = [];
    let reportReads = 0;
    const sql = async (parts, ...params) => {
      const query = parts.map((part, i) => (i ? `$${i}` : "") + part).join("");
      return (await pg.query(query, params)).rows;
    };
    sql.query = async (query, params) => {
      reportReads += 1;
      return (await pg.query(query, params)).rows;
    };
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    let id = 0;
    const captured = [];
    const modules = {
      "@tanstack/react-start": { createServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (status) => statuses.push(status) },
      "@/lib/auth/middleware": { authMiddleware: Symbol() },
      "@/lib/auth/gov-middleware": { govAuthMiddleware: Symbol() },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/ece-jobs": ece,
      "@/lib/features": { eceJobsEnabled: () => true },
      "@/lib/gap-features": gap,
      "@/lib/gov/places": {},
      "@/lib/gov/province-choice": {},
      "@/lib/utils": { nid: () => `synthetic-${++id}` },
      "@/lib/server/ghl-form-lead": {
        captureFormLead: async ({ form, userId }) => { captured.push([form, userId]); },
      },
    };
    const source = readFileSync(new URL("../src/lib/server/ece-jobs.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const handlers = {};
    new Function("require", "exports", compiled)((name) => {
      assert.ok(name in modules, name);
      return modules[name];
    }, handlers);
    const call = (fn, userId, data = {}) => handlers[fn]({ context: { userId }, data });
    const denied = { ok: false, reason: "owner" };
    for (const role of ["staff", "reader", "manager", "past-owner", "unrelated"]) {
      assert.deepEqual(await call("listMyEceApplicants", role), []);
      assert.deepEqual(await call("listMyCentresForJobs", role), []);
      assert.deepEqual(await call("listManagedEceJobs", role), { enabled: true, posts: [], applicants: [] });
      assert.deepEqual(await call("postEceJob", role, { daycareId: "a", role: "ECE lead" }), denied);
      assert.deepEqual(await call("setEceJobStatus", role, { jobId: "job-a", status: "closed" }), denied);
      assert.deepEqual(await call("setEceApplicationStatus", role, { applicationId: "app-a", status: "reviewed" }), denied);
    }
    assert.deepEqual(statuses, Array(30).fill(403));
    assert.equal(reportReads, 0);
    assert.equal((await pg.query("select count(*)::int as n from centre_job_posts")).rows[0].n, 2);
    assert.equal((await pg.query("select status from centre_job_posts where id='job-a'")).rows[0].status, "open");
    assert.equal((await pg.query("select status from job_applications where id='app-a'")).rows[0].status, "new");
    const result = await call("listManagedEceJobs", "owner");
    assert.deepEqual(result.posts.map(({ id }) => id), ["job-a"]);
    assert.deepEqual(result.applicants.map(({ id }) => id), ["app-a"]);
    assert.deepEqual((await call("listMyCentresForJobs", "owner")).map(({ id }) => id), ["a"]);
    assert.deepEqual(await call("postEceJob", "owner", { daycareId: "b", role: "ECE lead" }), denied);
    assert.deepEqual(await call("setEceJobStatus", "owner", { jobId: "job-b", status: "closed" }), denied);
    assert.deepEqual(await call("setEceApplicationStatus", "owner", { applicationId: "app-b", status: "reviewed" }), denied);
    const created = await call("postEceJob", "owner", { daycareId: "a", role: "ECE lead" });
    assert.equal(created.ok, true);
    assert.deepEqual(await call("setEceJobStatus", "secondary-owner", { jobId: created.id, status: "closed" }), { ok: true });
    assert.deepEqual(await call("setEceApplicationStatus", "secondary-owner", { applicationId: "app-a", status: "reviewed" }), { ok: true });
    assert.equal((await pg.query("select status from job_applications where id='app-a'")).rows[0].status, "reviewed");
    assert.deepEqual((await call("listPublicEceJobs", "staff")).map(({ id }) => id).sort(), ["job-a", "job-b"]);
    assert.deepEqual(await call("applyToEceJob", "staff", { jobId: "job-a", note: "Synthetic application" }), { ok: true });
    assert.deepEqual(captured, [["job-apply", "staff"]]);
    const applied = await pg.query("select email, note from job_applications where user_id='staff'");
    assert.deepEqual(applied.rows, [{ email: "staff@example.invalid", note: "Synthetic application" }]);
  } finally {
    await pg.close();
  }
});
