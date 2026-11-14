import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { privateHttpZoneForPath, roleMayEnterZone } from "../src/lib/gov/access.ts";
import { privateHttpUnavailableResponse } from "../src/lib/gov/http-isolation.ts";
import { canViewParentAgreement, PARENT_AGREEMENT_PACK } from "../src/lib/parent-agreement.ts";
import { signedPdfPath } from "../src/lib/docusign-packs.ts";

/** Execute production declarations; replace only transport, auth, SQL and PDF storage boundaries. */
function production(relative, names, dependencies, internals = []) {
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
  const context = vm.createContext({ exports: {}, Error, URL, Request, Response, Buffer, Uint8Array, Date, ...dependencies });
  new vm.Script(`${javascript}\nglobalThis.__internal = { ${internals.join(",")} };`, {
    filename: path.pathname,
  }).runInContext(context);
  return { ...context.exports, ...context.__internal };
}

const CONTRACT = {
  id: "contract-A", daycare_id: "centre-A", envelope_id: "local-envelope-A", signed_pdf_key: "local-signed-key-A",
  provider_user_id: "creator-A", document_name: "Enrolment agreement", status: "completed", pack_kind: PARENT_AGREEMENT_PACK,
};
const AGREEMENT = {
  contract_id: CONTRACT.id, parent_user_id: "parent-A", daycare_id: CONTRACT.daycare_id, child_id: "child-A", director_user_id: "creator-A",
};

function harness(overrides = {}) {
  const state = {
    user: { id: "parent-A" }, role: "parent", contract: { ...CONTRACT }, agreement: { ...AGREEMENT },
    owners: [], members: [], coparents: [], coparentFlag: true, coparentTable: true,
    enrolmentFlag: true, parentFlag: true, adminOk: false, ignorePackPredicate: false,
    queries: [], profileReads: 0, contractReads: 0, agreementReads: 0, pdfLoads: [], adminReads: [],
    sessionReads: 0, downstream: 0, imports: [], boundaryErrors: [], ...overrides,
  };
  function unexpected(message) {
    state.boundaryErrors.push(message);
    throw new Error(message);
  }
  async function query(text, values) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const parameters = Array.from(values);
    state.queries.push({ text: normalized, values: parameters });
    if (normalized.includes("from profiles")) {
      state.profileReads++;
      if (state.profileFaultAt === state.profileReads) throw new Error("private profile failure detail");
      const role = state.roleSequence?.[state.profileReads - 1] ?? state.role;
      return state.missingProfile ? [] : [{ role }];
    }
    if (normalized.includes("from daycare_contracts")) {
      state.contractReads++;
      if (state.contractError) throw state.contractError;
      if (!state.contract || state.contract.id !== parameters[0]) return [];
      if (!state.ignorePackPredicate && !(parameters[1] === true || state.contract.pack_kind === parameters[2])) return [];
      return [state.contract];
    }
    if (normalized.includes("from parent_enrolment_agreements")) {
      state.agreementReads++;
      if (state.agreementError) throw state.agreementError;
      return state.agreement?.contract_id === parameters[0] ? [state.agreement] : [];
    }
    if (normalized.includes("from provider_daycares")) {
      if (state.ownerError) throw state.ownerError;
      const owners = state.owners.filter((owner) => owner.daycare_id === parameters[0]);
      return normalized.includes("and user_id = ?") ? owners.filter((owner) => owner.user_id === parameters[1]) : owners;
    }
    if (normalized.includes("from centre_members")) {
      if (state.memberError) throw state.memberError;
      if (!normalized.includes("status = 'active'")) return unexpected("centre membership query lost its active predicate");
      return state.members.filter((member) => member.daycare_id === parameters[0] && member.status === "active");
    }
    if (normalized.includes("to_regclass")) {
      if (state.tableError) throw state.tableError;
      return state.coparentTable ? [{ reg: "public.child_coparent_links" }] : [];
    }
    if (normalized.includes("from child_coparent_links")) {
      if (state.coparentError) throw state.coparentError;
      if (!normalized.includes("status in ('linked', 'active')")) return unexpected("co-parent query lost its status predicate");
      return state.coparents.filter((link) => link.child_id === parameters[0] && ["linked", "active"].includes(link.status))
        .map((link) => ({ user_id: link.linked_user_id }));
    }
    return unexpected(`unmocked SQL: ${normalized}`);
  }
  const sql = (strings, ...values) => query(strings.join("?"), values);
  sql.query = query;
  const getSql = async () => sql;
  const auth = {
    getSessionUser: async () => {
      state.sessionReads++;
      if (state.sessionError) throw state.sessionError;
      return state.user;
    },
    requireUserId: async () => {
      const user = await auth.getSessionUser();
      if (!user) throw new Error("Unauthorized");
      return user.id;
    },
  };
  const guard = production("src/lib/server/gov-guard.server.ts", ["profileRoleForUser", "blockGovernmentOnPrivateHttp"], {
    getSql, privateHttpZoneForPath, roleMayEnterZone, privateHttpUnavailableResponse,
    __import: async (specifier) => {
      state.imports.push(specifier);
      if (specifier !== "@/lib/auth/verify.server") return unexpected(`unmocked guard import: ${specifier}`);
      return auth;
    },
  });
  const agreements = production("src/lib/server/parent-agreement.ts", [
    "centreUserIds", "linkedCoparentIds", "viewerCanRead", "parentAgreementReadable",
  ], { canViewParentAgreement, coparentLinkEnabled: () => state.coparentFlag });
  const handlers = production("src/routes/api/contracts.$id.pdf.ts", ["fail", "run", "Route"], {
    createFileRoute: () => (configuration) => configuration,
    getSql, profileRoleForUser: guard.profileRoleForUser, roleMayEnterZone, privateHttpUnavailableResponse, PARENT_AGREEMENT_PACK,
    resolveAdminAccess: async (userId) => { state.adminReads.push(userId); return { ok: state.adminOk }; },
    loadSignedPdfBytes: async (input) => {
      state.pdfLoads.push(input);
      return state.pdfMissing ? null : { body: Buffer.from("%PDF-1.4 local signed fixture") };
    },
    __import: async (specifier) => {
      state.imports.push(specifier);
      if (specifier === "@/lib/features") return {
        enrolmentEsignEnabled: () => state.enrolmentFlag, parentAgreementEnabled: () => state.parentFlag,
      };
      if (specifier === "@/lib/auth/verify.server") return auth;
      if (specifier === "@/lib/server/parent-agreement") return agreements;
      if (specifier === "@/lib/server/gov-guard.server") return guard;
      return unexpected(`unmocked PDF import: ${specifier}`);
    },
  }).Route.server.handlers;
  const { govHttpIsolation } = production("src/start.ts", ["govHttpIsolation"], {
    createMiddleware: () => ({ server: (handle) => handle }), privateHttpZoneForPath, privateHttpUnavailableResponse,
    __import: async (specifier) => {
      if (specifier !== "@/lib/server/gov-guard.server") return unexpected(`unmocked middleware import: ${specifier}`);
      return guard;
    },
  }, ["govHttpIsolation"]);
  const dispatch = async (path = signedPdfPath(CONTRACT.id), { direct = false, contractId = CONTRACT.id } = {}) => {
    const incoming = new Request(`https://example.test${path}`);
    const next = () => {
      state.downstream++;
      return handlers.GET({ request: incoming, params: { id: contractId } });
    };
    try {
      return await (direct ? next() : govHttpIsolation({ request: incoming, next }));
    } finally {
      assert.deepEqual(state.boundaryErrors, [], "unexpected boundary calls must not be hidden by production catches");
    }
  };
  return { state, dispatch };
}

function assertPackQuery(state, providerAllowed) {
  const calls = state.queries.filter(({ text }) => text.includes("from daycare_contracts"));
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /and\s*\(\?\s+or\s+pack_kind\s*=\s*\?\)/i);
  assert.deepEqual(calls[0].values, [CONTRACT.id, providerAllowed, PARENT_AGREEMENT_PACK]);
}

async function assertPdf(response, state) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(await response.text(), "%PDF-1.4 local signed fixture");
  assert.equal(state.pdfLoads.length, 1);
  const input = state.pdfLoads[0];
  assert.equal(input.contractId, CONTRACT.id);
  assert.equal(input.daycareId, CONTRACT.daycare_id);
  assert.equal(input.envelopeId, CONTRACT.envelope_id);
  assert.equal(input.signedPdfKey, CONTRACT.signed_pdf_key);
}

async function assertUnavailable(response) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(await response.text(), "Authorization is temporarily unavailable.");
}

test("parent agreement downloads retain the shared signedPdfPath through actual middleware and canonical/case/encoded GET handlers", async () => {
  assert.equal(signedPdfPath(CONTRACT.id), "/api/contracts/contract-A/pdf");
  for (const path of [
    signedPdfPath(CONTRACT.id), "/API/CONTRACTS/contract-A/PDF", "/Api/Contracts/contract-A/Pdf",
    "/%61pi/%63ontracts/contract-A/%70df", "/api/%63%6F%6E%74%72%61%63%74%73/contract-A/pdf/",
  ]) {
    const { state, dispatch } = harness();
    await assertPdf(await dispatch(path), state);
    assertPackQuery(state, false);
    assert.equal(state.agreementReads, 1);
    assert.equal(state.adminReads.length, 0);
  }
});

test("actual parent-agreement ACL preserves parent, linked co-parent, centre owner and active member access", async () => {
  for (const fixture of [
    { user: { id: "parent-A" } },
    { user: { id: "coparent-A" }, coparents: [{ child_id: "child-A", linked_user_id: "coparent-A", status: "linked" }] },
    { user: { id: "coparent-A" }, coparents: [{ child_id: "child-A", linked_user_id: "coparent-A", status: "active" }] },
    { role: "provider", user: { id: "owner-A" }, owners: [{ daycare_id: "centre-A", user_id: "owner-A" }] },
    { role: "provider", user: { id: "member-A" }, members: [{ daycare_id: "centre-A", user_id: "member-A", status: "active" }] },
  ]) {
    const { state, dispatch } = harness(fixture);
    await assertPdf(await dispatch(), state);
    assertPackQuery(state, fixture.role === "provider");
    assert.equal(state.adminReads.length, 0, "parent packs use the agreement ACL rather than an admin override");
  }
});

test("parent-agreement ACL rejects revoked or disabled links, former creators, unrelated centres and unrelated admins", async () => {
  const coparent = { child_id: "child-A", linked_user_id: "coparent-A", status: "linked" };
  for (const fixture of [
    { user: { id: "coparent-A" }, coparents: [{ ...coparent, status: "revoked" }] },
    { user: { id: "coparent-A" }, coparents: [{ ...coparent, status: "pending" }] },
    { user: { id: "coparent-A" }, coparents: [{ ...coparent, child_id: "different-child" }] },
    { user: { id: "coparent-A" }, coparents: [coparent], coparentFlag: false },
    { user: { id: "coparent-A" }, coparents: [coparent], coparentTable: false },
    { user: { id: "coparent-A" }, coparents: [coparent], agreement: { ...AGREEMENT, child_id: null } },
    { role: "provider", user: { id: "member-A" }, members: [{ daycare_id: "centre-A", user_id: "member-A", status: "revoked" }] },
    { role: "provider", user: { id: "owner-A" }, owners: [{ daycare_id: "different-centre", user_id: "owner-A" }] },
    { role: "provider", user: { id: "creator-A" } },
    { role: "admin", user: { id: "unrelated-admin" }, adminOk: true },
    { user: { id: "unrelated-parent" } },
    { agreement: null },
  ]) {
    const { state, dispatch } = harness(fixture);
    assert.equal((await dispatch()).status, 401, JSON.stringify(fixture));
    assert.equal(state.pdfLoads.length, 0);
    assert.equal(state.adminReads.length, 0, "parent packs never fall through to generic admin/creator authorization");
  }
});

test("generic contract downloads retain provider-owner, recorded signer and resolved-admin authorization", async () => {
  for (const packKind of ["provider_agreement", "enrolment_pack", null, "legacy-unknown-pack"]) {
    for (const fixture of [
      { role: "provider", user: { id: "owner-A" }, owners: [{ daycare_id: "centre-A", user_id: "owner-A" }] },
      { role: "provider", user: { id: "creator-A" } },
      { role: "admin", user: { id: "operator-A" }, adminOk: true },
    ]) {
      const { state, dispatch } = harness({ ...fixture, contract: { ...CONTRACT, pack_kind: packKind } });
      await assertPdf(await dispatch(), state);
      assertPackQuery(state, true);
      assert.equal(state.agreementReads, 0);
      assert.equal(state.adminReads.length, 1);
    }
  }
});

test("generic contracts still reject active membership alone and unrelated provider or unresolved admin accounts", async () => {
  for (const fixture of [
    { role: "provider", user: { id: "member-A" }, members: [{ daycare_id: "centre-A", user_id: "member-A", status: "active" }] },
    { role: "provider", user: { id: "unrelated-provider" } },
    { role: "admin", user: { id: "unresolved-admin" }, adminOk: false },
  ]) {
    const { state, dispatch } = harness({ ...fixture, contract: { ...CONTRACT, pack_kind: "provider_agreement" } });
    assert.equal((await dispatch()).status, 401);
    assert.equal(state.pdfLoads.length, 0);
    assert.equal(state.agreementReads, 0);
    assertPackQuery(state, true);
  }
});

test("bound pack restriction hides every non-parent pack from parent-role residual owners and signers like unknown IDs", async () => {
  for (const packKind of ["provider_agreement", "enrolment_pack", null, "legacy-unknown-pack", "PARENT_ENROLMENT_AGREEMENT"]) {
    for (const fixture of [
      { owners: [{ daycare_id: "centre-A", user_id: "parent-A" }] },
      { contract: { ...CONTRACT, provider_user_id: "parent-A" } },
      { adminOk: true },
    ]) {
      const { state, dispatch } = harness({
        ...fixture, contract: { ...CONTRACT, ...fixture.contract, pack_kind: packKind },
      });
      const response = await dispatch();
      assert.equal(response.status, 404, `${packKind} ${JSON.stringify(fixture)}`);
      assert.deepEqual(await response.json(), { ok: false, error: "Contract not found" });
      assertPackQuery(state, false);
      assert.equal(state.pdfLoads.length, 0);
      assert.equal(state.adminReads.length, 0);
      assert.equal(state.agreementReads, 0);
      assert.equal(state.queries.some(({ text }) => text.includes("from provider_daycares")), false);
    }
  }
  const missing = harness();
  const absent = await missing.dispatch(signedPdfPath("unknown-contract"), { contractId: "unknown-contract" });
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { ok: false, error: "Contract not found" });
  assert.equal(missing.state.pdfLoads.length, 0);
});

test("explicit generic-pack role gate denies parent residual access even if a SQL adapter returns an excluded row", async () => {
  for (const packKind of ["provider_agreement", "enrolment_pack", null, "legacy-unknown-pack"]) {
    const { state, dispatch } = harness({
      ignorePackPredicate: true, adminOk: true, owners: [{ daycare_id: "centre-A", user_id: "parent-A" }],
      contract: { ...CONTRACT, pack_kind: packKind, provider_user_id: "parent-A" },
    });
    assert.equal((await dispatch()).status, 403);
    assertPackQuery(state, false);
    assert.equal(state.pdfLoads.length, 0);
    assert.equal(state.adminReads.length, 0);
    assert.equal(state.queries.some(({ text }) => text.includes("from provider_daycares")), false);
  }
});

test("query-string pack, role, owner and centre claims cannot replace stored pack eligibility", async () => {
  const { state, dispatch } = harness({
    contract: { ...CONTRACT, pack_kind: "provider_agreement", provider_user_id: "parent-A" },
    owners: [{ daycare_id: "centre-A", user_id: "parent-A" }], adminOk: true,
  });
  const response = await dispatch(`${signedPdfPath(CONTRACT.id)}?pack_kind=${PARENT_AGREEMENT_PACK}&packKind=${PARENT_AGREEMENT_PACK}&role=provider&providerZoneAllowed=true&daycareId=centre-A&userId=creator-A`);
  assert.equal(response.status, 404);
  assertPackQuery(state, false);
  assert.equal(state.adminReads.length, 0);
  assert.equal(state.pdfLoads.length, 0);
});

test("government and unknown roles are rejected before contract reads by middleware and the actual route's own role check", async () => {
  for (const role of ["government", " GOVERNMENT ", "unknown", "support", null]) {
    for (const direct of [false, true]) {
      const { state, dispatch } = harness({
        role, owners: [{ daycare_id: "centre-A", user_id: "parent-A" }],
        contract: { ...CONTRACT, provider_user_id: "parent-A" }, adminOk: true,
      });
      assert.equal((await dispatch(undefined, { direct })).status, 403, `${role} direct=${direct}`);
      assert.equal(state.contractReads, 0);
      assert.equal(state.pdfLoads.length, 0);
      assert.equal(state.agreementReads, 0);
      assert.equal(state.downstream, direct ? 1 : 0);
    }
  }
  for (const role of ["government", "unknown"]) {
    const { state, dispatch } = harness({ roleSequence: ["parent", role] });
    assert.equal((await dispatch()).status, 403, "a changed role is rechecked by the route");
    assert.equal(state.profileReads, 2);
    assert.equal(state.contractReads, 0);
    assert.equal(state.pdfLoads.length, 0);
  }
});

test("guests and missing profiles cannot download; profile and contract lookup failures never become PDF permission", async () => {
  const guest = harness({ user: null });
  assert.equal((await guest.dispatch()).status, 401);
  assert.equal(guest.state.downstream, 1);
  assert.equal(guest.state.contractReads, 0);
  assert.equal(guest.state.pdfLoads.length, 0);
  const missingProfile = harness({ missingProfile: true });
  assert.equal((await missingProfile.dispatch()).status, 403);
  assert.equal(missingProfile.state.contractReads, 0);
  for (const profileFaultAt of [1, 2]) {
    const { state, dispatch } = harness({ profileFaultAt });
    await assertUnavailable(await dispatch());
    assert.equal(state.contractReads, 0);
    assert.equal(state.pdfLoads.length, 0);
  }
  const contractFailure = harness({ contractError: new Error("private contract SQL detail") });
  await assertUnavailable(await contractFailure.dispatch());
  assert.equal(contractFailure.state.contractReads, 1);
  assert.equal(contractFailure.state.pdfLoads.length, 0);
});

test("required agreement and sole-association failures deny access while unnecessary ancillary failures preserve a proven parent", async () => {
  for (const fixture of [
    { agreementError: new Error("agreement unavailable") },
    { role: "provider", user: { id: "owner-A" }, owners: [{ daycare_id: "centre-A", user_id: "owner-A" }], ownerError: new Error("owners unavailable") },
    { role: "provider", user: { id: "member-A" }, members: [{ daycare_id: "centre-A", user_id: "member-A", status: "active" }], memberError: new Error("members unavailable") },
    { user: { id: "coparent-A" }, coparents: [{ child_id: "child-A", linked_user_id: "coparent-A", status: "linked" }], coparentError: new Error("links unavailable") },
    { user: { id: "coparent-A" }, coparents: [{ child_id: "child-A", linked_user_id: "coparent-A", status: "linked" }], tableError: new Error("table lookup unavailable") },
  ]) {
    const { state, dispatch } = harness(fixture);
    assert.equal((await dispatch()).status, 401);
    assert.equal(state.pdfLoads.length, 0);
  }
  const provenParent = harness({
    ownerError: new Error("owners unavailable"), memberError: new Error("members unavailable"), coparentError: new Error("links unavailable"),
  });
  await assertPdf(await provenParent.dispatch(), provenParent.state);
});

test("existing feature-off and absent-signed-PDF responses retain their behavior without storage writes", async () => {
  for (const fixture of [{ enrolmentFlag: false }, { parentFlag: false }]) {
    const { state, dispatch } = harness(fixture);
    const response = await dispatch();
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "Signing is not open yet.");
    assert.equal(state.pdfLoads.length, 0);
  }
  for (const { status, expected } of [
    { status: "completed", expected: "Signed PDF is not stored yet" },
    { status: "signed", expected: "Signed PDF is not stored yet" },
    { status: "sent", expected: "No signed PDF yet" },
  ]) {
    const { state, dispatch } = harness({ pdfMissing: true, contract: { ...CONTRACT, status } });
    const response = await dispatch();
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, expected);
    assert.equal(state.pdfLoads.length, 1);
  }
});
