import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import {
  parseShift,
  shiftDateTimeInput,
  shiftDraftFromSaved,
  shiftInputForEdit,
} from "../src/lib/staff-scheduling.ts";
import { staffCopy } from "../src/lib/staff-scheduling-copy.ts";

// Only pure scheduling/copy modules are imported. The server handler below is
// extracted from source so the full server module and its imports never run.
function savedShift(overrides = {}) {
  return {
    staffName: "Avery Example",
    role: "ece",
    roomBand: "preschool",
    startsAt: "2026-11-18T14:15:37.123Z",
    endsAt: "2026-11-18T22:45:09.456Z",
    ...overrides,
  };
}

// These callbacks are synchronous; restore the test process's zone immediately.
function withTimeZone(zone, callback) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test("edit prefill uses local control values across a UTC date boundary", () => {
  const saved = savedShift({
    startsAt: "2026-11-18T01:02:03.123Z",
    endsAt: "2026-11-18T06:32:09.456Z",
  });
  const original = structuredClone(saved);

  withTimeZone("UTC", () => {
    assert.equal(shiftDateTimeInput(saved.startsAt), "2026-11-18T01:02");
    assert.deepEqual(shiftDraftFromSaved(saved), {
      ...saved,
      startsAt: "2026-11-18T01:02",
      endsAt: "2026-11-18T06:32",
    });
  });
  withTimeZone("America/Toronto", () => {
    assert.equal(shiftDateTimeInput(saved.startsAt), "2026-11-17T20:02");
    assert.deepEqual(shiftDraftFromSaved(saved), {
      ...saved,
      startsAt: "2026-11-17T20:02",
      endsAt: "2026-11-18T01:32",
    });
  });

  assert.deepEqual(saved, original);
});

test("untouched time controls retain the original seconds and milliseconds", () => {
  for (const zone of ["UTC", "America/Toronto"]) {
    withTimeZone(zone, () => {
      const saved = savedShift();
      const draft = shiftDraftFromSaved(saved);
      const originalDraft = structuredClone(draft);
      assert.deepEqual(shiftInputForEdit(draft, saved), saved);
      assert.deepEqual(draft, originalDraft);
    });
  }
});

test("untouched repeated DST hours preserve each saved instant", () => {
  withTimeZone("America/Toronto", () => {
    for (const startsAt of [
      "2026-11-01T05:30:35.123Z",
      "2026-11-01T06:30:35.123Z",
    ]) {
      const saved = savedShift({
        startsAt,
        endsAt: "2026-11-01T09:30:51.456Z",
      });
      const draft = shiftDraftFromSaved(saved);
      assert.equal(draft.startsAt, "2026-11-01T01:30");
      assert.equal(shiftInputForEdit(draft, saved).startsAt, startsAt);
      assert.equal(shiftInputForEdit(draft, saved).endsAt, saved.endsAt);
    }
  });
});

test("an edited local time becomes ISO without changing the other timestamp", () => {
  withTimeZone("America/Toronto", () => {
    const saved = savedShift();
    const draft = {
      ...shiftDraftFromSaved(saved),
      startsAt: "2026-11-18T10:20",
    };
    const originalDraft = structuredClone(draft);
    const input = shiftInputForEdit(draft, saved);
    assert.equal(input.startsAt, "2026-11-18T15:20:00.000Z");
    assert.equal(input.endsAt, saved.endsAt);
    assert.equal(parseShift(input).ok, true);
    assert.deepEqual(draft, originalDraft);
  });
});

test("invalid edit text remains intact for ordinary shift validation", () => {
  withTimeZone("America/Toronto", () => {
    for (const startsAt of ["not-a-time", ""]) {
      const saved = savedShift();
      const draft = { ...shiftDraftFromSaved(saved), startsAt };
      const originalDraft = structuredClone(draft);
      const input = shiftInputForEdit(draft, saved);
      assert.equal(input.startsAt, startsAt);
      assert.deepEqual(parseShift(input), { ok: false, error: "time" });
      assert.deepEqual(draft, originalDraft);
    }
  });
});

test("shift editing has complete English and French action labels", () => {
  for (const [locale, expected] of [
    [
      "en",
      {
        editShiftTitle: "Edit shift",
        editShift: "Edit",
        saveShiftChanges: "Save changes",
        cancelShiftEdit: "Cancel",
      },
    ],
    [
      "fr",
      {
        editShiftTitle: "Modifier le quart",
        editShift: "Modifier",
        saveShiftChanges: "Enregistrer les modifications",
        cancelShiftEdit: "Annuler",
      },
    ],
  ]) {
    const copy = staffCopy(locale);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(copy[key], value, `${locale}: ${key}`);
    }
  }
});

let handlerScript;

function exactSaveShiftHandler() {
  if (handlerScript) return handlerScript;
  const sourceUrl = new URL("../src/lib/server/staff-scheduling.ts", import.meta.url);
  const filename = fileURLToPath(sourceUrl);
  const source = readFileSync(sourceUrl, "utf8");
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = tree.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((item) => ts.isIdentifier(item.name) && item.name.text === "saveStaffShift");
  assert.ok(declaration?.initializer, "saveStaffShift declaration exists");
  const call = declaration.initializer;
  assert.ok(ts.isCallExpression(call), "saveStaffShift ends in a handler call");
  assert.ok(ts.isPropertyAccessExpression(call.expression));
  assert.equal(call.expression.name.text, "handler");
  const handler = call.arguments[0];
  assert.ok(handler && ts.isArrowFunction(handler), "extract only the existing handler function");
  const { outputText } = ts.transpileModule(
    `const runStaffShiftHandler = ${handler.getText(tree)}; runStaffShiftHandler;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    },
  );
  handlerScript = new vm.Script(outputText, { filename: `${filename}:saveStaffShift` });
  return handlerScript;
}

const sqlField = {
  id: "id",
  daycare_id: "daycareId",
  staff_name: "staffName",
  role: "role",
  room_band: "roomBand",
  starts_at: "startsAt",
  ends_at: "endsAt",
  created_by: "createdBy",
};

function fixtureRow(overrides = {}) {
  return {
    id: "shf-existing-example",
    daycareId: "centre-example",
    ...savedShift(),
    createdBy: "staff-owner-example",
    createdAt: "2026-11-17T12:00:00.000Z",
    ...overrides,
  };
}

function shiftHandlerFixture(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [row.id, structuredClone(row)]));
  const queries = [];
  const generatedIds = [];

  // This recorder supports only the two ordinary shift writes. It has no
  // database client, connection string, network access, or server-module import.
  async function sql(strings, ...parameters) {
    const statement = strings
      .reduce((text, part, index) => `${text}${index ? `$${index}` : ""}${part}`, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    queries.push({ statement, parameters });

    if (statement.startsWith("update staff_shifts ")) {
      const match = statement.match(
        /^update staff_shifts set (.+) where id = \$(\d+) and daycare_id = \$(\d+) returning id$/,
      );
      assert.ok(match, "record the existing shift update shape");
      const [, assignments, idParameter, centreParameter] = match;
      const row = rows.get(parameters[Number(idParameter) - 1]);
      if (!row || row.daycareId !== parameters[Number(centreParameter) - 1]) return [];
      for (const assignment of assignments.split(",")) {
        const field = assignment.trim().match(/^(\w+) = \$(\d+)$/);
        assert.ok(field, "update assignment is parameterized");
        assert.ok(Object.hasOwn(sqlField, field[1]), "known shift field");
        row[sqlField[field[1]]] = parameters[Number(field[2]) - 1];
      }
      return [{ id: row.id }];
    }

    if (statement.startsWith("insert into staff_shifts ")) {
      const match = statement.match(
        /^insert into staff_shifts \(([^)]+)\) values \(\s*([^)]+?)\s*\) returning id$/,
      );
      assert.ok(match, "record the existing shift insert shape");
      const columns = match[1].split(",").map((column) => column.trim());
      const placeholders = match[2].split(",").map((value) => value.trim());
      assert.equal(columns.length, placeholders.length);
      const row = {};
      for (let index = 0; index < columns.length; index += 1) {
        assert.ok(Object.hasOwn(sqlField, columns[index]), "known shift field");
        const placeholder = placeholders[index].match(/^\$(\d+)$/);
        assert.ok(placeholder, "insert value is parameterized");
        row[sqlField[columns[index]]] = parameters[Number(placeholder[1]) - 1];
      }
      assert.ok(!rows.has(row.id), "a new shift receives a new id");
      rows.set(row.id, row);
      return [{ id: row.id }];
    }

    throw new Error("The shift fixture supports no other SQL.");
  }

  // Passing stubs keep these product tests focused on saving shifts. They make
  // no claims about authorization, screening, or the real database path.
  const handler = exactSaveShiftHandler().runInNewContext({
    staffSchedulingEnabled: () => true,
    assertCentreWrite: async () => {},
    parseShift,
    ensureStaffTables: async () => {},
    getSql: async () => sql,
    nid: (prefix) => {
      const id = `${prefix}-created-example-${generatedIds.length + 1}`;
      generatedIds.push(id);
      return id;
    },
    require: (specifier) => {
      assert.equal(specifier, "@/lib/server/compliance-screening");
      return { screeningGate: async () => ({ block: false, status: "clear" }) };
    },
  });

  return {
    rows,
    queries,
    generatedIds,
    save: (data) => handler({ context: { userId: "staff-owner-example" }, data }),
  };
}

test("saving an edit changes the same shift without adding a row or id", async () => {
  const existing = fixtureRow();
  const other = fixtureRow({ id: "shf-other-example", staffName: "Morgan Example" });
  const fixture = shiftHandlerFixture([existing, other]);
  const edited = savedShift({
    staffName: "Avery Updated",
    role: "assistant",
    roomBand: "toddler",
    startsAt: "2026-11-18T15:00:00.000Z",
    endsAt: "2026-11-18T21:00:00.000Z",
  });
  const result = await fixture.save({ ...edited, id: existing.id, daycareId: existing.daycareId });

  assert.equal(result.ok, true);
  assert.equal(result.id, existing.id);
  assert.equal(result.hours, 6);
  assert.equal(fixture.rows.size, 2);
  assert.deepEqual(fixture.rows.get(existing.id), { ...existing, ...edited });
  assert.deepEqual(fixture.rows.get(other.id), other);
  assert.equal(fixture.generatedIds.length, 0);
  assert.equal(fixture.queries.length, 1);
  assert.match(fixture.queries[0].statement, /^update staff_shifts /);
});

test("a missing saved shift reports failure without inserting a replacement", async () => {
  const existing = fixtureRow();
  const fixture = shiftHandlerFixture([existing]);
  const result = await fixture.save({
    ...savedShift(),
    id: "shf-missing-example",
    daycareId: existing.daycareId,
  });

  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.deepEqual([...fixture.rows.values()], [existing]);
  assert.equal(fixture.generatedIds.length, 0);
  assert.equal(fixture.queries.length, 1);
  assert.match(fixture.queries[0].statement, /^update staff_shifts /);
});

test("adding a shift still creates a separate row with a new id", async () => {
  const existing = fixtureRow();
  const fixture = shiftHandlerFixture([existing]);
  const added = savedShift({ staffName: "Morgan Example" });
  const result = await fixture.save({ ...added, daycareId: existing.daycareId });

  assert.equal(result.ok, true);
  assert.notEqual(result.id, existing.id);
  assert.equal(fixture.rows.size, 2);
  assert.deepEqual(fixture.rows.get(existing.id), existing);
  assert.deepEqual(fixture.rows.get(result.id), {
    id: result.id,
    daycareId: existing.daycareId,
    ...added,
    createdBy: "staff-owner-example",
  });
  assert.deepEqual(fixture.generatedIds, [result.id]);
  assert.equal(fixture.queries.length, 1);
  assert.match(fixture.queries[0].statement, /^insert into staff_shifts /);
});

test("invalid edit values perform no write and preserve the draft", async () => {
  const existing = fixtureRow();
  const fixture = shiftHandlerFixture([existing]);
  const { draft, input } = withTimeZone("America/Toronto", () => {
    const draft = { ...shiftDraftFromSaved(existing), startsAt: "not-a-time" };
    return { draft, input: shiftInputForEdit(draft, existing) };
  });
  const originalDraft = structuredClone(draft);
  await assert.rejects(
    fixture.save({ ...input, id: existing.id, daycareId: existing.daycareId }),
    /Check the name and the times\./,
  );

  assert.deepEqual(draft, originalDraft);
  assert.deepEqual([...fixture.rows.values()], [existing]);
  assert.equal(fixture.queries.length, 0);
  assert.equal(fixture.generatedIds.length, 0);
});
