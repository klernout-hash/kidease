import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { handleAlexa, verifyAlexaRequest } from "../src/lib/server/alexa.ts";
import { privateHttpUnavailableResponse } from "../src/lib/gov/http-isolation.ts";

// Execute the actual route module, replacing only framework transport, signature
// verification and SQL boundaries. The real handleAlexa owns every intent check.
function routeWith(dependencies) {
  const path = new URL("../src/routes/api/alexa.ts", import.meta.url);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const transformed = ts.transform(source, [(context) => {
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) return undefined;
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
    exports: {}, Request, Response, Error, Date, privateHttpUnavailableResponse,
    createFileRoute: () => (configuration) => configuration,
    ...dependencies,
  });
  new vm.Script(javascript, { filename: path.pathname }).runInContext(context);
  return context.exports.Route.server.handlers.POST;
}

function harness(overrides = {}) {
  const state = {
    role: "parent", provider: false, hasProfile: true, tokenValid: true,
    sqlAcquires: 0, verificationCalls: [], queries: [], privateReads: [], publicReads: [], networkCalls: 0, imports: [], events: [],
    ...overrides,
  };
  const environment = { FEATURE_ALEXA_SKILL: "1", ALEXA_SKILL_ID: "local-fixture-skill" };
  if (state.featureOff) environment.FEATURE_ALEXA_SKILL = "0";
  const post = routeWith({
    process: { env: environment },
    fetch: async () => { state.networkCalls++; throw new Error("No certificate or network requests in local boundary tests"); },
    __import: async (specifier) => {
      state.imports.push(specifier);
      if (specifier === "@/lib/server/alexa") return {
        handleAlexa,
        verifyAlexaRequest: async (env, headers, body, dependencies) => {
          state.events.push("verify");
          state.verificationCalls.push({ headers, body });
          if (state.featureOff) return verifyAlexaRequest(env, headers, body, dependencies);
          if (state.badSignature) return { ok: false, status: 400, error: "bad signature" };
          assert.equal(headers.signature, "fixture-signature");
          assert.equal(headers.certUrl, "https://s3.amazonaws.com/echo.api/fixture.pem");
          return { ok: true, json: JSON.parse(body) };
        },
      };
      assert.equal(specifier, "@/lib/db");
      return { getSql: async () => {
        state.events.push("sql-acquire");
        state.sqlAcquires++;
        if (state.sqlAcquireError) throw state.sqlAcquireError;
        return { query: async (text, values) => {
          const params = Array.from(values);
          state.queries.push({ text, values: params });
          if (/from "session" s/.test(text)) {
            state.events.push("identity");
            // Enforce the expiry/token predicates and current-profile join in
            // every legitimate case, rather than merely returning a role mock.
            assert.match(text, /select s\."userId" as user_id, profile\.role/);
            assert.match(text, /join profiles profile on profile\.user_id = s\."userId"/);
            assert.match(text, /where s\.token = \$1 and s\."expiresAt" > now\(\)/);
            assert.match(text, /exists\(select 1 from provider_daycares/);
            assert.deepEqual(params, ["linked-token"]);
            if (state.identityError) throw state.identityError;
            if (!state.tokenValid || !state.hasProfile) return [];
            return [{ user_id: "linked-user", role: state.role, provider: state.provider }];
          }
          if (/from daily_journals/.test(text)) {
            state.privateReads.push("day-log");
            assert.deepEqual(params, ["linked-user"]);
            return [{ n: 2 }]; // Residual private rows deliberately remain present.
          }
          if (/from messages m/.test(text)) {
            state.privateReads.push("messages");
            assert.deepEqual(params, ["linked-user"]);
            return [{ n: 4 }];
          }
          assert.match(text, /from daycares where lower\(city\) = lower\(\$1\)/);
          state.publicReads.push(params[0]);
          return [{ centres: 3, spots: 7 }];
        } };
      } };
    },
  });
  async function send(intent, { token = true, locale = "en-CA", contextToken = false, city } = {}) {
    const json = {
      session: { user: token && !contextToken ? { accessToken: "linked-token" } : {} },
      ...(contextToken ? { context: { System: { user: { accessToken: "linked-token" } } } } : {}),
      request: { type: "IntentRequest", timestamp: "2026-11-12T12:00:00Z", locale,
        intent: { name: intent, ...(city ? { slots: { city: { value: city } } } : {}) } },
    };
    const request = new Request("https://example.test/api/alexa", { method: "POST",
      headers: { "signaturecertchainurl": "https://s3.amazonaws.com/echo.api/fixture.pem", "signature-256": "fixture-signature" },
      body: JSON.stringify(json) });
    return post({ request });
  }
  return { state, send };
}

function assertNoPrivateQueries(state) {
  assert.deepEqual(state.privateReads, []);
  assert.equal(state.networkCalls, 0);
  assert.ok(state.queries.every(({ text }) => /^\s*select\b/i.test(text)), "Only mocked SELECT reads are allowed");
}

test("government linked identities never read private counts despite residual parent and provider records", async () => {
  for (const role of ["government", " GOVERNMENT "]) {
    for (const provider of [false, true]) {
      for (const locale of ["en-CA", "fr-CA"]) {
        for (const intent of ["DayLogIntent", "NewMessagesIntent"]) {
          const { state, send } = harness({ role, provider });
          const response = await send(intent, { locale, contextToken: provider });
          assert.equal(response.status, 200);
          const body = await response.json();
          assert.equal(body.response.card.type, "LinkAccount");
          assert.match(body.response.outputSpeech.text, locale === "fr-CA" ? /Liez votre compte/ : /Please link/);
          assert.equal(state.queries.length, 1, "Only the authoritative identity query runs");
          assert.deepEqual(state.events, ["verify", "sql-acquire", "identity"]);
          assertNoPrivateQueries(state);
        }
      }
    }
  }
});

test("missing and unknown current profiles stay unlinked rather than falling back to parent", async () => {
  for (const overrides of [
    { hasProfile: false },
    ...[null, undefined, "", " ", "unknown", "admin", "support", "support_lead"].map((role) => ({ role })),
  ]) {
    for (const provider of [false, true]) {
      for (const intent of ["DayLogIntent", "NewMessagesIntent"]) {
        const { state, send } = harness({ ...overrides, provider });
        const body = await (await send(intent)).json();
        assert.equal(body.response.card.type, "LinkAccount");
        assertNoPrivateQueries(state);
      }
    }
  }
});

test("role-query and SQL acquisition failures return generic unavailable without relink or private counts", async () => {
  for (const failure of ["identityError", "sqlAcquireError"]) {
    for (const provider of [false, true]) {
      for (const intent of ["DayLogIntent", "NewMessagesIntent"]) {
        const unavailable = harness({ [failure]: new Error("sensitive SQL details"), provider });
        const response = await unavailable.send(intent);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("x-robots-tag"), "noindex");
        const text = await response.text();
        assert.equal(text, "Authorization is temporarily unavailable.");
        assert.doesNotMatch(text, /sensitive SQL|LinkAccount|link your|Liez votre/i);
        assertNoPrivateQueries(unavailable.state);
      }
    }
  }
});

test("legitimate parent and provider roles preserve the existing centre-association behavior in EN and FR", async () => {
  for (const role of ["parent", "provider", " PARENT ", " PROVIDER "]) {
    for (const provider of [false, true]) {
      for (const locale of ["en-CA", "fr-CA"]) {
        const intent = provider ? "NewMessagesIntent" : "DayLogIntent";
        const allowed = harness({ role, provider });
        const body = await (await allowed.send(intent, { locale })).json();
        assert.equal(body.response.card, undefined);
        assert.match(body.response.outputSpeech.text, provider
          ? locale === "fr-CA" ? /4 nouveaux messages/ : /4 new messages/
          : locale === "fr-CA" ? /2 entrées de journal/ : /2 day log entries/);
        assert.deepEqual(allowed.state.privateReads, [provider ? "messages" : "day-log"]);
        const wrongIntent = harness({ role, provider });
        const denied = await (await wrongIntent.send(provider ? "DayLogIntent" : "NewMessagesIntent", { locale })).json();
        assert.equal(denied.response.card, undefined);
        assertNoPrivateQueries(wrongIntent.state);
      }
    }
  }
});

test("missing and expired or invalid session tokens never query private counts", async () => {
  for (const tokenValid of [false, true]) {
    for (const token of [false, true]) {
      if (tokenValid && token) continue;
      const { state, send } = harness({ tokenValid });
      const body = await (await send("DayLogIntent", { token })).json();
      assert.equal(body.response.card.type, "LinkAccount");
      assert.equal(state.queries.length, token ? 1 : 0);
      assertNoPrivateQueries(state);
    }
  }
});

test("public spots keep their EN/FR behavior without resolving linked identity", async () => {
  for (const locale of ["en-CA", "fr-CA"]) {
    const { state, send } = harness({ role: "government", provider: true, identityError: new Error("must not look up identity") });
    const body = await (await send("FindSpotsIntent", { locale, city: "Winnipeg" })).json();
    assert.match(body.response.outputSpeech.text, locale === "fr-CA" ? /3 garderies.*7 places/ : /3 daycares.*7 open spots/);
    assert.deepEqual(state.publicReads, ["Winnipeg"]);
    assert.deepEqual(state.events, ["verify", "sql-acquire"]);
    assertNoPrivateQueries(state);
  }
});

test("real feature-off verification and rejected signatures stop before SQL or private work", async () => {
  for (const overrides of [{ featureOff: true }, { badSignature: true }]) {
    const { state, send } = harness(overrides);
    const response = await send("DayLogIntent");
    assert.equal(response.status, overrides.featureOff ? 404 : 400);
    assert.equal(state.verificationCalls.length, 1);
    assert.deepEqual(state.events, ["verify"]);
    assert.equal(state.sqlAcquires, 0);
    assert.equal(state.imports.includes("@/lib/db"), false);
    assertNoPrivateQueries(state);
  }
});
