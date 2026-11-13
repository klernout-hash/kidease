import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { privateHttpZoneForPath, roleMayEnterZone } from "../src/lib/gov/access.ts";
import { privateHttpUnavailableResponse } from "../src/lib/gov/http-isolation.ts";
import { cronAuthorized } from "../src/lib/cron-auth.ts";
import { invoicePdfHttpResponse } from "../src/lib/invoice-pdf.ts";
import * as vaultRules from "../src/lib/family-vault.ts";
import * as privateDocRules from "../src/lib/private-docs.ts";

/** Run actual production bodies; only framework transport and external boundaries are replaced. */
function productionDeclarations(relative, names, dependencies, internals = []) {
  const path = new URL(`../${relative}`, import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const wanted = new Set(names);
  const declarations = source.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return wanted.has(node.name?.text);
    return ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text));
  });
  assert.equal(declarations.length, names.length, `production declarations changed in ${relative}`);
  const selected = ts.createSourceFile(path.pathname, declarations.map((node) => node.getText(source)).join("\n"), ts.ScriptTarget.Latest, true);
  const transformed = ts.transform(selected, [(context) => {
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        return ts.factory.createCallExpression(ts.factory.createIdentifier("__import"), undefined, node.arguments);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit);
  }]);
  const javascript = ts.transpileModule(ts.createPrinter().printFile(transformed.transformed[0]), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  transformed.dispose();
  const context = vm.createContext({
    exports: {}, Error, URL, Request, Response, Buffer, Uint8Array, Date, ...dependencies,
  });
  new vm.Script(`${javascript}\nglobalThis.__internal = { ${internals.join(",")} };`, {
    filename: path.pathname,
  }).runInContext(context);
  return { ...context.exports, ...context.__internal };
}

function isolationHarness(overrides = {}) {
  const state = {
    user: { id: "parent-A" }, role: "parent", imports: [], sessions: 0, profileReads: 0, downstream: 0,
    ...overrides,
  };
  const getSessionUser = async () => {
    state.sessions++;
    if (state.sessionError) throw state.sessionError;
    return state.user;
  };
  const auth = {
    getSessionUser,
    requireUserId: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Unauthorized");
      return user.id;
    },
  };
  const guard = productionDeclarations("src/lib/server/gov-guard.server.ts", [
    "profileRoleForUser", "blockGovernmentOnPrivateHttp",
  ], {
    privateHttpZoneForPath, roleMayEnterZone, privateHttpUnavailableResponse,
    getSql: async () => {
      if (state.sqlAcquireError) throw state.sqlAcquireError;
      return async (strings, ...values) => {
        assert.match(strings.join("?"), /select role from profiles where user_id\s*=\s*\?/i);
        assert.equal(values[0], state.user.id);
        state.profileReads++;
        if (state.profileError) throw state.profileError;
        return state.noProfile ? [] : [{ role: state.role }];
      };
    },
    __import: async (specifier) => {
      state.imports.push(specifier);
      assert.equal(specifier, "@/lib/auth/verify.server");
      if (state.verifyImportError) throw state.verifyImportError;
      return auth;
    },
  });
  const { govHttpIsolation } = productionDeclarations("src/start.ts", ["govHttpIsolation"], {
    privateHttpZoneForPath, privateHttpUnavailableResponse,
    createMiddleware: () => ({ server: (handle) => handle }),
    __import: async (specifier) => {
      state.imports.push(specifier);
      assert.equal(specifier, "@/lib/server/gov-guard.server");
      if (state.guardImportError) throw state.guardImportError;
      return guard;
    },
  }, ["govHttpIsolation"]);
  const run = (request, next = () => new Response("downstream")) => govHttpIsolation({
    request,
    next: () => { state.downstream++; return next(); },
  });
  return { state, auth, guard, run };
}

function request(path = "/api/family-documents", options) {
  return new Request(`https://example.test${path}`, options);
}

async function unavailable(response) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), "Authorization is temporarily unavailable.");
}

test("actual request middleware fails closed on guard import, session import, session, and profile failures", async () => {
  for (const fault of ["guardImportError", "verifyImportError", "sessionError", "sqlAcquireError", "profileError"]) {
    const harness = isolationHarness({ [fault]: new Error(`sensitive ${fault} detail`) });
    await unavailable(await harness.run(request()));
    assert.equal(harness.state.downstream, 0, `${fault} must not invoke the endpoint`);
  }
  const malformed = isolationHarness();
  await unavailable(await malformed.run({ url: "invalid request URL" }));
  assert.equal(malformed.state.downstream, 0);
  assert.equal(malformed.state.imports.length, 0);
});

test("actual HTTP guard independently contains auth failures and skips public/government auth lookups", async () => {
  for (const fault of ["verifyImportError", "sessionError", "sqlAcquireError", "profileError"]) {
    const harness = isolationHarness({ [fault]: new Error("private backend details") });
    await unavailable(await harness.guard.blockGovernmentOnPrivateHttp(request()));
  }
  for (const path of ["/", "/search", "/gov/login", "/api/gov/export", "/API/GOV/open-data", "/api/health", "/api/auth/session"]) {
    const harness = isolationHarness({ guardImportError: new Error("must not import"), sessionError: new Error("must not authenticate") });
    assert.equal((await harness.run(request(path))).status, 200);
    assert.equal(await harness.guard.blockGovernmentOnPrivateHttp(request(path)), null);
    assert.equal(harness.state.imports.length, 0);
    assert.equal(harness.state.sessions, 0);
    assert.equal(harness.state.profileReads, 0);
    assert.equal(harness.state.downstream, 1);
  }
});

test("actual middleware preserves guest and role policy across each private zone", async () => {
  const matrix = [
    { path: "/api/family-documents", allowed: ["parent", "provider", "admin"] },
    { path: "/api/screening-documents", allowed: ["provider", "admin"] },
    { path: "/api/admin/contracts", allowed: ["admin"] },
  ];
  for (const { path, allowed } of matrix) {
    for (const role of ["parent", "provider", "admin", "government", " GOVERNMENT ", "unknown", null]) {
      const harness = isolationHarness({ role });
      const response = await harness.run(request(path));
      const mayEnter = allowed.includes(role);
      assert.equal(response.status, mayEnter ? 200 : 403, `${String(role)} on ${path}`);
      assert.equal(harness.state.downstream, mayEnter ? 1 : 0);
      assert.equal(harness.state.profileReads, 1);
      if (!mayEnter) assert.equal(await response.text(), "Not authorized");
    }
    const guest = isolationHarness({ user: null });
    assert.equal((await guest.run(request(path))).status, 200);
    assert.equal(guest.state.profileReads, 0);
    assert.equal(guest.state.downstream, 1, "confirmed guests reach each endpoint's own authentication");
    const missing = isolationHarness({ noProfile: true });
    assert.equal((await missing.run(request(path))).status, 403);
    assert.equal(missing.state.downstream, 0);
  }
});

test("downstream synchronous and asynchronous errors propagate once, without retrying an endpoint", async () => {
  for (const path of ["/api/family-documents", "/api/health", "/api/gov/export"]) {
    for (const asynchronous of [false, true]) {
      const harness = isolationHarness();
      const failure = new Error("endpoint failure");
      const next = asynchronous ? async () => { throw failure; } : () => { throw failure; };
      await assert.rejects(harness.run(request(path), next), (error) => error === failure);
      assert.equal(harness.state.downstream, 1);
    }
  }
});

const createFileRoute = () => (configuration) => configuration;
const MOCK_DOCUMENT = {
  id: "document-A", user_id: "owner-A", kind: "immunization", file_name: "family-record.pdf",
  mime: "application/pdf", storage_ref: "data:mock-local-fixture", created_at: "2026-01-01T00:00:00Z",
};

function familyHarness(overrides = {}) {
  const isolation = isolationHarness({ user: { id: "owner-A" }, ...overrides });
  const state = Object.assign(isolation.state, {
    documents: [{ ...MOCK_DOCUMENT }], shares: [], centreIds: [], vaultQueries: [], storageLoads: [],
    vaultImports: 0, centreAccess: 0, uploadReads: 0, deleted: [], ...overrides,
  });
  const sql = async (strings, ...values) => query(strings.join("?"), values);
  sql.query = async (text, values) => query(text, values);
  async function query(text, values) {
    const normalized = text.replace(/\s+/g, " ").trim();
    state.vaultQueries.push({ text: normalized, values });
    if (normalized.includes("from saved_daycares")) return [];
    if (normalized.startsWith("delete from family_documents")) {
      const owned = state.documents.find((doc) => doc.id === values[0] && doc.user_id === values[1]);
      if (owned) {
        state.deleted.push(owned.id);
        state.documents = state.documents.filter((doc) => doc !== owned);
      }
      return [];
    }
    if (normalized.includes("from family_documents") && normalized.includes("where id = ? and user_id = ?")) {
      return state.documents.filter((doc) => doc.id === values[0] && doc.user_id === values[1]);
    }
    if (normalized.includes("from family_documents") && normalized.includes("where user_id = ?")) {
      return state.documents.filter((doc) => doc.user_id === values[0]);
    }
    if (normalized.includes("join family_document_shares s")) {
      return state.shares.filter((share) => share.document_id === values[0]).flatMap((share) =>
        state.documents.filter((doc) => doc.id === share.document_id).map((doc) => ({ ...doc, ...share })));
    }
    if (normalized.includes("from family_document_shares s") && normalized.includes("s.daycare_id = any")) {
      return state.shares.filter((share) => !share.revoked_at && values[0].includes(share.daycare_id)).flatMap((share) =>
        state.documents.filter((doc) => doc.id === share.document_id).map((doc) => ({
          ...doc, ...share, share_id: share.id, document_id: doc.id, daycare_name: "Fixture centre", parent_name: "Fixture parent",
        })));
    }
    if (normalized.includes("from family_document_shares s") && normalized.includes("s.document_id = any")) {
      return state.shares.filter((share) => values[0].includes(share.document_id));
    }
    throw new Error(`Unmocked vault SQL: ${normalized}`);
  }
  const centreAccess = {
    listAccessibleDaycareIds: async () => { state.centreAccess++; return state.centreIds; },
    hasCentreDeskAccess: async (_sql, _userId, daycareId) => {
      state.centreAccess++;
      return state.centreIds.includes(daycareId);
    },
  };
  const vault = productionDeclarations("src/lib/server/family-vault.ts", [
    "iso", "chosenCentreIds", "listParentVault", "deleteFamilyDocument", "forgetStorage", "listCentreFamilyDocs", "loadFamilyDocumentFor",
  ], {
    ...vaultRules, R2_FAMILY_PREFIX: privateDocRules.R2_FAMILY_PREFIX,
    getSql: async () => sql,
    __import: async (specifier) => {
      assert.equal(specifier, "@/lib/server/centre-access", "a fixture must never reach real storage");
      return centreAccess;
    },
  });
  const dependencies = {
    createFileRoute, ...privateDocRules,
    readUploadFile: async () => { state.uploadReads++; throw new Error("fixture must not upload"); },
    loadPrivateDoc: async (storageRef, mime, filename) => {
      state.storageLoads.push(storageRef);
      return { body: Buffer.from("local fixture bytes"), mime, filename };
    },
    __import: async (specifier) => {
      if (specifier === "@/lib/features") return { familyVaultEnabled: () => true };
      if (specifier === "@/lib/auth/verify.server") return isolation.auth;
      assert.equal(specifier, "@/lib/server/family-vault");
      state.vaultImports++;
      return vault;
    },
  };
  const collection = productionDeclarations("src/routes/api/family-documents.ts", ["fail", "Route"], dependencies).Route.server.handlers;
  const document = productionDeclarations("src/routes/api/family-documents.$id.ts", ["fail", "Route"], dependencies).Route.server.handlers;
  const dispatch = (incoming, kind = "collection", id = "document-A") => isolation.run(incoming, () =>
    (kind === "document" ? document : collection)[incoming.method]({ request: incoming, params: { id } }));
  return { ...isolation, state, dispatch };
}

test("government HTTP isolation stops actual family GET/POST/download handlers despite residual ownership and centre access", async () => {
  for (const path of ["/api/family-documents", "/API/FAMILY-DOCUMENTS", "/%61pi/%66amily-documents", "/api/%66%61%6D%69%6Cy-documents/"]) {
    for (const operation of ["list", "centre", "delete", "multipart", "download"]) {
      const harness = familyHarness({
        user: { id: "owner-A" }, role: "government", centreIds: ["residual-centre"],
        shares: [{ id: "share-A", document_id: "document-A", daycare_id: "residual-centre", revoked_at: null }],
      });
      let bodyReads = 0;
      const incoming = operation === "delete"
        ? request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", documentId: "document-A" }) })
        : operation === "multipart"
          ? request(path, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=fixture" }, body: "fixture" })
          : request(`${path}${operation === "download" ? "/document-A" : operation === "centre" ? "?desk=centre" : ""}`);
      incoming.formData = async () => { bodyReads++; throw new Error("must not consume forbidden body"); };
      const response = await harness.dispatch(incoming, operation === "download" ? "document" : "collection");
      assert.equal(response.status, 403, `${operation} ${path}`);
      assert.equal(harness.state.downstream, 0);
      assert.equal(harness.state.vaultImports, 0);
      assert.equal(harness.state.vaultQueries.length, 0);
      assert.equal(harness.state.storageLoads.length, 0);
      assert.equal(harness.state.centreAccess, 0);
      assert.equal(harness.state.deleted.length, 0);
      assert.equal(harness.state.uploadReads, 0);
      assert.equal(bodyReads, 0);
      assert.equal(harness.state.documents[0].user_id, harness.state.user.id, "the forbidden user really owns the residual fixture");
    }
  }
});

test("legitimate owner list, private download and delete retain actual family-vault ownership checks", async () => {
  const harness = familyHarness();
  const list = await harness.dispatch(request());
  assert.equal(list.status, 200);
  assert.equal((await list.json()).documents[0].id, "document-A");
  const download = await harness.dispatch(request("/api/family-documents/document-A"), "document");
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("cache-control"), "private, no-store");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await download.text(), "local fixture bytes");
  assert.deepEqual(harness.state.storageLoads, [MOCK_DOCUMENT.storage_ref]);
  const deleted = await harness.dispatch(request("/api/family-documents", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "delete", documentId: "document-A" }),
  }));
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).ok, true);
  assert.deepEqual(harness.state.deleted, ["document-A"]);
  assert.equal(harness.state.documents.length, 0);
  assert.ok(harness.state.vaultQueries.every(({ values }) => !values.includes("government")));
});

test("endpoint authentication and actual vault checks still deny guests and unrelated users after middleware allows a role", async () => {
  const guest = familyHarness({ user: null });
  assert.equal((await guest.dispatch(request())).status, 401);
  assert.equal((await guest.dispatch(request("/api/family-documents/document-A"), "document")).status, 401);
  assert.equal(guest.state.vaultImports, 0);
  assert.equal(guest.state.storageLoads.length, 0);
  for (const role of ["parent", "provider", "admin"]) {
    const stranger = familyHarness({ role, user: { id: "unrelated-user" } });
    assert.equal((await stranger.dispatch(request("/api/family-documents/document-A"), "document")).status, 404);
    assert.equal(stranger.state.storageLoads.length, 0);
    const deleted = await stranger.dispatch(request("/api/family-documents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", documentId: "document-A" }),
    }));
    assert.equal(deleted.status, 404);
    assert.equal(stranger.state.deleted.length, 0);
    assert.equal(stranger.state.documents.length, 1);
  }
});

test("actual shared-document authorization honors centre access and revoked shares", async () => {
  for (const { centreIds, revokedAt, expected } of [
    { centreIds: ["centre-A"], revokedAt: null, expected: 200 },
    { centreIds: ["unrelated-centre"], revokedAt: null, expected: 404 },
    { centreIds: ["centre-A"], revokedAt: "2026-02-01T00:00:00Z", expected: 404 },
  ]) {
    const harness = familyHarness({
      role: "provider", user: { id: "centre-user" }, centreIds,
      shares: [{ id: "share-A", document_id: "document-A", daycare_id: "centre-A", revoked_at: revokedAt }],
    });
    const response = await harness.dispatch(request("/api/family-documents/document-A"), "document");
    assert.equal(response.status, expected);
    assert.equal(harness.state.storageLoads.length, expected === 200 ? 1 : 0);
  }
});

function cronHarness(overrides = {}) {
  const isolation = isolationHarness({ user: null, ...overrides });
  const state = Object.assign(isolation.state, { jobs: [], securityEvents: [], heartbeats: [] });
  const handlers = productionDeclarations("src/routes/api/tour-holds.ts", ["run", "Route"], {
    createFileRoute,
    cronAuthorized: (incoming) => cronAuthorized(incoming, "local-test-secret"),
    requestIp: () => "local-fixture",
    logSecurityEvent: async (event) => { state.securityEvents.push(event); },
    shouldDeferTourHoldsToInngest: () => false,
    runExpireTourHoldsJob: async (input) => { state.jobs.push(input); return { ok: true, expired: 0 }; },
    pingCronHeartbeat: async (name) => { state.heartbeats.push(name); },
  }).Route.server.handlers;
  return { state, dispatch: (incoming) => isolation.run(incoming, () => handlers[incoming.method]({ request: incoming })) };
}

test("healthy guest cron keeps actual bearer-secret authorization on GET and POST", async () => {
  for (const method of ["GET", "POST"]) {
    for (const valid of [false, true]) {
      const harness = cronHarness();
      const response = await harness.dispatch(request("/api/tour-holds?dryRun=1", {
        method, headers: { authorization: valid ? "Bearer local-test-secret" : "Bearer invalid" },
      }));
      assert.equal(response.status, valid ? 200 : 401);
      assert.equal(harness.state.jobs.length, valid ? 1 : 0);
      assert.equal(harness.state.securityEvents[0].kind, valid ? "tour_holds_run" : "tour_holds_denied");
      assert.equal(harness.state.heartbeats.length, valid ? 1 : 0);
      if (valid) assert.equal(harness.state.jobs[0].dryRun, true);
    }
  }
  const querySecret = cronHarness();
  assert.equal((await querySecret.dispatch(request("/api/tour-holds?secret=local-test-secret"))).status, 401);
  assert.equal(querySecret.state.jobs.length, 0);
});

test("cron secret cannot bypass private authorization outages or a government session", async () => {
  for (const overrides of [
    { guardImportError: new Error("guard module unavailable") },
    { verifyImportError: new Error("verify module unavailable") },
    { sessionError: new Error("session unavailable") },
    { user: { id: "provider-A" }, role: "provider", profileError: new Error("profile unavailable") },
    { user: { id: "government-A" }, role: "government" },
  ]) {
    const harness = cronHarness(overrides);
    const response = await harness.dispatch(request("/api/tour-holds", {
      headers: { authorization: "Bearer local-test-secret" },
    }));
    if (overrides.role === "government") assert.equal(response.status, 403);
    else await unavailable(response);
    assert.equal(harness.state.downstream, 0);
    assert.equal(harness.state.jobs.length, 0);
    assert.equal(harness.state.securityEvents.length, 0);
    assert.equal(harness.state.heartbeats.length, 0);
  }
});

const MOCK_INVOICE = {
  stripe_invoice_id: "invoice-A", number: "KE-1001", amount_cents: 12500, currency: "cad", status: "paid",
  paid_at: "2026-01-01T00:00:00Z", hosted_invoice_url: null, invoice_pdf: null,
  parent_user_id: "invoice-owner", daycare_id: "invoice-centre", customer_email: "fixture@example.test",
  daycare_name: "Fixture Childcare",
};

function invoiceHarness(overrides = {}) {
  const isolation = isolationHarness({ user: { id: "invoice-owner" }, ...overrides });
  const state = Object.assign(isolation.state, {
    invoice: { ...MOCK_INVOICE }, invoiceQueries: [], familyScopeReads: [], centreReads: [],
    centreIds: [], homeUserId: null, pdfResponses: [], ...overrides,
  });
  const sql = async (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ");
    assert.match(text, /from stripe_parent_invoices i .*where i\.stripe_invoice_id = \?/);
    assert.deepEqual(values, ["invoice-A"]);
    state.invoiceQueries.push({ text, values });
    return state.invoice ? [state.invoice] : [];
  };
  const invoices = productionDeclarations("src/lib/server/stripe-parent-invoices.ts", [
    "loadInvoiceForDownload", "loadRow", "canRead", "toView",
  ], {
    getSql: async () => sql,
    listAccessibleDaycareIds: async (connection, userId) => {
      assert.equal(connection, sql);
      state.centreReads.push(userId);
      return state.centreIds;
    },
    __import: async (specifier) => {
      assert.equal(specifier, "@/lib/server/coparent");
      return {
        familyScopeFor: async (userId) => {
          state.familyScopeReads.push(userId);
          return { dataUserId: state.homeUserId || userId };
        },
      };
    },
  });
  const handlers = productionDeclarations("src/routes/api/invoices.$id.pdf.ts", ["run", "Route"], {
    createFileRoute, loadInvoiceForDownload: invoices.loadInvoiceForDownload,
    invoicePdfHttpResponse: (input) => {
      state.pdfResponses.push(input);
      return invoicePdfHttpResponse(input);
    },
    __import: async (specifier) => {
      assert.equal(specifier, "@/lib/auth/verify.server");
      return isolation.auth;
    },
  }).Route.server.handlers;
  const dispatch = (path = "/api/invoices/invoice-A/pdf") => {
    const incoming = request(path);
    return isolation.run(incoming, () => handlers.GET({ request: incoming, params: { id: "invoice-A" } }));
  };
  return { ...isolation, state, dispatch };
}

test("government residual invoice owners cannot reach actual invoice SQL, PDF generation or redirects on router-equivalent paths", async () => {
  for (const path of [
    "/api/invoices/invoice-A/pdf", "/API/INVOICES/invoice-A/PDF", "/Api/Invoices/invoice-A/Pdf",
    "/%61pi/%69nvoices/invoice-A/%70df", "/api/%69%6E%76%6F%69%63%65%73/invoice-A/pdf",
  ]) {
    for (const invoicePdf of [null, "https://pay.stripe.com/invoice/fixture/pdf"]) {
      const harness = invoiceHarness({
        role: "government", centreIds: ["invoice-centre"],
        invoice: { ...MOCK_INVOICE, invoice_pdf: invoicePdf },
      });
      const response = await harness.dispatch(path);
      assert.equal(response.status, 403, path);
      assert.equal(response.headers.get("location"), null);
      assert.equal(harness.state.invoice.parent_user_id, harness.state.user.id, "fixture retains real ownership");
      assert.equal(harness.state.downstream, 0);
      assert.equal(harness.state.invoiceQueries.length, 0);
      assert.equal(harness.state.familyScopeReads.length, 0);
      assert.equal(harness.state.centreReads.length, 0);
      assert.equal(harness.state.pdfResponses.length, 0);
    }
  }
});

test("actual invoice canRead preserves owner, co-parent and centre-authorized downloads", async () => {
  for (const { role, userId, homeUserId, centreIds, familyReads, centreReads } of [
    { role: "parent", userId: "invoice-owner", familyReads: 0, centreReads: 0 },
    { role: "parent", userId: "co-parent", homeUserId: "invoice-owner", familyReads: 1, centreReads: 0 },
    { role: "provider", userId: "provider-A", centreIds: ["invoice-centre"], familyReads: 1, centreReads: 1 },
    { role: "admin", userId: "admin-A", centreIds: ["invoice-centre"], familyReads: 1, centreReads: 1 },
  ]) {
    const harness = invoiceHarness({ role, user: { id: userId }, homeUserId, centreIds: centreIds || [] });
    const response = await harness.dispatch();
    assert.equal(response.status, 200, `${role} ${userId}`);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="kidease-KE-1001.pdf"');
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const pdf = await response.text();
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.match(pdf, /PAID/);
    assert.match(pdf, /Fixture Childcare/);
    assert.equal(harness.state.invoiceQueries.length, 1);
    assert.equal(harness.state.familyScopeReads.length, familyReads);
    assert.equal(harness.state.centreReads.length, centreReads);
    assert.equal(harness.state.pdfResponses[0].authorized, true);
    assert.equal(harness.state.pdfResponses[0].invoice.amountCents, MOCK_INVOICE.amount_cents);
  }
});

test("actual invoice canRead denies unrelated parent/provider/admin without a blanket admin override", async () => {
  for (const role of ["parent", "provider", "admin"]) {
    const harness = invoiceHarness({
      role, user: { id: `unrelated-${role}` }, centreIds: ["different-centre"],
      invoice: { ...MOCK_INVOICE, invoice_pdf: "https://pay.stripe.com/invoice/fixture/pdf" },
    });
    const response = await harness.dispatch();
    assert.equal(response.status, 401, role);
    assert.equal(response.headers.get("location"), null);
    assert.equal((await response.json()).error, "Not authorized");
    assert.equal(harness.state.invoiceQueries.length, 1);
    assert.equal(harness.state.familyScopeReads.length, 1);
    assert.equal(harness.state.centreReads.length, 1);
    assert.equal(harness.state.pdfResponses[0].invoice, null);
  }
});

test("invoice guests retain endpoint denial and profile outages stop before invoice reads or rendering", async () => {
  const guest = invoiceHarness({ user: null });
  assert.equal((await guest.dispatch()).status, 401);
  assert.equal(guest.state.downstream, 1, "a confirmed guest reaches the handler's own authentication");
  assert.equal(guest.state.invoiceQueries.length, 0);
  assert.equal(guest.state.pdfResponses[0].authorized, false);
  const unavailableProfile = invoiceHarness({ profileError: new Error("profile backend detail") });
  await unavailable(await unavailableProfile.dispatch());
  assert.equal(unavailableProfile.state.downstream, 0);
  assert.equal(unavailableProfile.state.invoiceQueries.length, 0);
  assert.equal(unavailableProfile.state.pdfResponses.length, 0);
  const missing = invoiceHarness({ invoice: null });
  assert.equal((await missing.dispatch()).status, 404);
  assert.equal(missing.state.invoiceQueries.length, 1);
  assert.equal(missing.state.centreReads.length, 0);
});

test("authorized invoice downloads retain the actual HTTPS guard and branded PDF fallback without network access", async () => {
  for (const url of [
    "https://pay.stripe.com/invoice/fixture/pdf", "http://example.test/invoice.pdf", "javascript:alert(1)", "data:application/pdf,fixture", null,
  ]) {
    const harness = invoiceHarness({ invoice: { ...MOCK_INVOICE, invoice_pdf: url } });
    const response = await harness.dispatch();
    const redirect = url?.startsWith("https://") === true;
    assert.equal(response.status, redirect ? 302 : 200);
    assert.equal(response.headers.get("location"), redirect ? url : null);
    assert.equal(harness.state.invoiceQueries.length, 1);
    assert.equal(harness.state.pdfResponses[0].authorized, true);
    if (!redirect) {
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.ok((await response.text()).startsWith("%PDF-1.4"));
    }
  }
});
