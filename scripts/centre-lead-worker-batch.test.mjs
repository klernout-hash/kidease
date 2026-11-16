import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { withCentreLeadWorkerBatch } from "../src/lib/server/centre-lead-worker-batch.ts";

const migration = readFileSync(
  new URL("../migrations/0204_centre_lead_worker.sql", import.meta.url),
  "utf8",
);
const centreId = (n) => `centre-${String(n).padStart(3, "0")}`;
const ids = (n) => Array.from({ length: n }, (_, index) => centreId(index + 1));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

function sqlFor(pg, beforeQuery = async () => {}) {
  const run = async (text, params = []) => {
    await beforeQuery(text, params);
    return (await pg.query(text, params)).rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1)
      text += `$${index + 1}${strings[index + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  return sql;
}

async function database(t, count = 0) {
  // An isolated in-memory database: the application DB module is never loaded.
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(`
    create table centre_lead_settings (
      daycare_id text primary key,
      enabled_at timestamptz not null,
      stale_days int not null default 3
    );
  `);
  await pg.exec(migration);
  await pg.query(
    `
    insert into centre_lead_settings (daycare_id, enabled_at)
    select 'centre-' || lpad(i::text, 3, '0'), now() - i * interval '1 hour'
    from generate_series(1, $1::int) i
  `,
    [count],
  );
  return { pg, sql: sqlFor(pg) };
}

async function state(pg) {
  return (await pg.query("select * from centre_lead_worker_state where id = 'centre-leads'"))
    .rows[0];
}

for (const count of [0, 1, 20, 21, 45]) {
  test(`bounded durable rotation covers ${count} existing centres`, async (t) => {
    const { pg } = await database(t, count);
    const original = (await pg.query("select * from centre_lead_settings order by daycare_id"))
      .rows;
    const visited = [];
    const rounds = Math.max(1, Math.ceil(count / 20));
    for (let round = 0; round < rounds; round += 1) {
      // A fresh adapter each time also verifies no in-process cursor is required.
      const result = await withCentreLeadWorkerBatch(sqlFor(pg), {
        processCentre: async (id) => {
          visited.push(id);
        },
        shouldSkip: () => false,
      });
      assert.equal(result.ok, true);
      assert.equal(result.skipped, false);
      assert.equal(result.selected, Math.min(count, 20));
      assert.equal(result.attempted, result.selected);
      assert.equal(result.synced, result.selected);
      assert.equal(result.failed, 0);
      assert.equal(result.skippedCentres, 0);
      assert.equal(result.sent, 0);
      assert.equal(new Set(visited.slice(round * Math.min(count, 20))).size, Math.min(count, 20));
      assert.equal((await state(pg)).lease_token, null);
    }
    assert.deepEqual([...new Set(visited)], ids(count));
    assert.deepEqual(
      (await pg.query("select * from centre_lead_settings order by daycare_id")).rows,
      original,
    );
    assert.equal((await state(pg)).after_daycare_id, visited.at(-1) || "");
  });
}

test("wrap uses disjoint keysets even when the saved cursor row is deleted", async (t) => {
  const { pg, sql } = await database(t, 25);
  await withCentreLeadWorkerBatch(sql, { processCentre: async () => {}, shouldSkip: () => false });
  assert.equal((await state(pg)).after_daycare_id, centreId(20));
  await pg.query("delete from centre_lead_settings where daycare_id = $1", [centreId(20)]);
  const visited = [];
  const result = await withCentreLeadWorkerBatch(sql, {
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: () => false,
  });
  assert.deepEqual(visited, [...ids(25).slice(20), ...ids(15)]);
  assert.equal(new Set(visited).size, 20);
  assert.equal(result.selected, 20);
  assert.equal((await state(pg)).after_daycare_id, centreId(15));
});

test("a centre failure is reported and checkpointed so the next centre gets a turn", async (t) => {
  const { pg, sql } = await database(t, 3);
  let finishCalled = 0;
  const first = await withCentreLeadWorkerBatch(sql, {
    batchSize: 1,
    processCentre: async () => {
      throw new Error("Synthetic centre failure");
    },
    finish: async () => {
      finishCalled += 1;
      return 2;
    },
    shouldSkip: () => false,
  });
  assert.deepEqual(first, {
    ok: false,
    skipped: false,
    selected: 1,
    attempted: 1,
    synced: 0,
    failed: 1,
    failedCentreIds: [centreId(1)],
    skippedCentres: 0,
    sent: 2,
  });
  assert.equal(finishCalled, 1);
  assert.equal((await state(pg)).after_daycare_id, centreId(1));
  const visited = [];
  await withCentreLeadWorkerBatch(sqlFor(pg), {
    batchSize: 1,
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: () => false,
  });
  assert.deepEqual(visited, [centreId(2)]);
});

test("hidden centres advance the cursor without callbacks and are counted separately", async (t) => {
  const { pg, sql } = await database(t, 25);
  const visited = [];
  const options = {
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: (id) => id <= centreId(20),
  };
  const first = await withCentreLeadWorkerBatch(sql, options);
  assert.equal(first.selected, 20);
  assert.equal(first.attempted, 0);
  assert.equal(first.skippedCentres, 20);
  assert.equal((await state(pg)).after_daycare_id, centreId(20));
  const second = await withCentreLeadWorkerBatch(sql, options);
  assert.deepEqual(visited, ids(25).slice(20));
  assert.equal(second.attempted, 5);
  assert.equal(second.skippedCentres, 15);
});

test("batch size is capped at 20 and a small batch resumes from its checkpoint", async (t) => {
  const { pg, sql } = await database(t, 45);
  const first = await withCentreLeadWorkerBatch(sql, {
    batchSize: 100,
    processCentre: async () => {},
    shouldSkip: () => false,
  });
  assert.equal(first.selected, 20);
  const visited = [];
  const second = await withCentreLeadWorkerBatch(sql, {
    batchSize: 2,
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: () => false,
  });
  assert.equal(second.selected, 2);
  assert.deepEqual(visited, [centreId(21), centreId(22)]);
  assert.equal((await state(pg)).after_daycare_id, centreId(22));
});

test(
  "concurrent claims admit only one worker and the busy worker calls no callbacks",
  { timeout: 10_000 },
  async (t) => {
    const { pg, sql } = await database(t, 1);
    const entered = deferred();
    const release = deferred();
    let processed = 0;
    let finished = 0;
    const options = {
      processCentre: async () => {
        processed += 1;
        entered.resolve();
        await release.promise;
      },
      finish: async () => {
        finished += 1;
        return 3;
      },
      shouldSkip: () => false,
    };
    const first = withCentreLeadWorkerBatch(sql, options);
    const second = withCentreLeadWorkerBatch(sqlFor(pg), options);
    await entered.promise;
    const busy = await Promise.race([first, second]);
    assert.equal(busy.reason, "busy");
    assert.equal(busy.attempted, 0);
    assert.equal(busy.sent, 0);
    assert.equal(processed, 1);
    release.resolve();
    const results = await Promise.all([first, second]);
    assert.equal(results.filter((result) => !result.skipped).length, 1);
    assert.equal(finished, 1);
    assert.equal((await state(pg)).lease_token, null);
  },
);

test("finish runs under the healthy lease, including an empty centre batch", async (t) => {
  const { pg, sql } = await database(t);
  let finishCalled = 0;
  const result = await withCentreLeadWorkerBatch(sql, {
    processCentre: async () => {
      assert.fail("No enrolled centres");
    },
    shouldSkip: () => false,
    finish: async () => {
      finishCalled += 1;
      const rows = await pg.query(
        "select lease_token is not null and lease_until > clock_timestamp() as owned from centre_lead_worker_state",
      );
      assert.equal(rows.rows[0].owned, true);
      const overlap = await withCentreLeadWorkerBatch(sql, {
        processCentre: async () => {
          assert.fail("Busy callback");
        },
        finish: async () => {
          assert.fail("Busy finish");
        },
        shouldSkip: () => false,
      });
      assert.equal(overlap.reason, "busy");
      return 4;
    },
  });
  assert.equal(finishCalled, 1);
  assert.equal(result.sent, 4);
  assert.equal(result.attempted, 0);
  assert.equal((await state(pg)).lease_token, null);
});

test("expired ownership is rejected before the next callback or finish", async (t) => {
  const { pg } = await database(t, 2);
  let renewals = 0;
  const sql = sqlFor(pg, async (query) => {
    if (
      query.includes("update centre_lead_worker_state") &&
      query.includes("returning id") &&
      !query.includes("set after_daycare_id")
    ) {
      renewals += 1;
      if (renewals === 2)
        await pg.exec(
          "update centre_lead_worker_state set lease_until = clock_timestamp() - interval '1 second'",
        );
    }
  });
  const visited = [];
  let finished = 0;
  const result = await withCentreLeadWorkerBatch(sql, {
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: () => false,
    finish: async () => {
      finished += 1;
      return 0;
    },
  });
  assert.equal(result.reason, "lease_lost");
  assert.deepEqual(visited, [centreId(1)]);
  assert.equal(finished, 0);
  assert.equal((await state(pg)).after_daycare_id, centreId(1));
});

test("lease loss immediately before finish prevents the finish callback", async (t) => {
  const { pg } = await database(t);
  const sql = sqlFor(pg, async (query) => {
    if (query.includes("update centre_lead_worker_state") && query.includes("returning id")) {
      await pg.exec(
        "update centre_lead_worker_state set lease_until = clock_timestamp() - interval '1 second'",
      );
    }
  });
  const result = await withCentreLeadWorkerBatch(sql, {
    processCentre: async () => {},
    shouldSkip: () => false,
    finish: async () => {
      assert.fail("Expired finish");
    },
  });
  assert.equal(result.reason, "lease_lost");
  assert.equal(result.sent, 0);
});

test(
  "takeover rejects the old checkpoint and its release cannot clear the new lease",
  { timeout: 10_000 },
  async (t) => {
    const { pg, sql } = await database(t, 2);
    const replacementEntered = deferred();
    const releaseReplacement = deferred();
    let replacement;
    let replacementToken;
    const first = await withCentreLeadWorkerBatch(sql, {
      batchSize: 1,
      shouldSkip: () => false,
      processCentre: async () => {
        await pg.exec(
          "update centre_lead_worker_state set lease_until = clock_timestamp() - interval '1 second'",
        );
        replacement = withCentreLeadWorkerBatch(sqlFor(pg), {
          batchSize: 1,
          processCentre: async () => {
            replacementEntered.resolve();
            await releaseReplacement.promise;
          },
          shouldSkip: () => false,
        });
        await replacementEntered.promise;
        replacementToken = (await state(pg)).lease_token;
      },
      finish: async () => {
        assert.fail("Old finish must stop");
      },
    });
    assert.equal(first.reason, "lease_lost");
    assert.equal(first.synced, 1); // Domain effects can finish after expiry; they are not fenced.
    assert.equal((await state(pg)).lease_token, replacementToken);
    assert.equal((await state(pg)).after_daycare_id, "");
    releaseReplacement.resolve();
    assert.equal((await replacement).ok, true);
    assert.equal((await state(pg)).after_daycare_id, centreId(1));
    assert.equal((await state(pg)).lease_token, null);
  },
);

test("lease expiry during finish reports loss after its effects without claiming rollback", async (t) => {
  const { pg, sql } = await database(t);
  const result = await withCentreLeadWorkerBatch(sql, {
    processCentre: async () => {},
    shouldSkip: () => false,
    finish: async () => {
      await pg.exec(
        "update centre_lead_worker_state set lease_until = clock_timestamp() - interval '1 second'",
      );
      return 2;
    },
  });
  assert.equal(result.reason, "lease_lost");
  assert.equal(result.sent, 2);
});

test("claim and checkpoint SQL errors propagate and are never reported as completed work", async (t) => {
  const { pg } = await database(t, 1);
  let processed = 0;
  const options = {
    processCentre: async () => {
      processed += 1;
    },
    shouldSkip: () => false,
  };
  await assert.rejects(
    withCentreLeadWorkerBatch(
      sqlFor(pg, async (query) => {
        if (query.includes("insert into centre_lead_worker_state"))
          throw new Error("Synthetic claim SQL failure");
      }),
      options,
    ),
    /claim SQL failure/,
  );
  assert.equal(processed, 0);
  assert.equal(await state(pg), undefined);
  await assert.rejects(
    withCentreLeadWorkerBatch(
      sqlFor(pg, async (query) => {
        if (query.includes("set after_daycare_id"))
          throw new Error("Synthetic checkpoint SQL failure");
      }),
      options,
    ),
    /checkpoint SQL failure/,
  );
  assert.equal(processed, 1);
  assert.equal((await state(pg)).after_daycare_id, "");
  assert.equal((await state(pg)).lease_token, null);
});

test("a crash before checkpoint may repeat effects, and finish failure releases ownership", async (t) => {
  const { pg, sql } = await database(t, 1);
  const visited = [];
  await assert.rejects(
    withCentreLeadWorkerBatch(
      sqlFor(pg, async (query) => {
        if (query.includes("set after_daycare_id"))
          throw new Error("Synthetic interrupted checkpoint");
      }),
      {
        processCentre: async (id) => {
          visited.push(id);
        },
        shouldSkip: () => false,
      },
    ),
    /interrupted checkpoint/,
  );
  await assert.rejects(
    withCentreLeadWorkerBatch(sql, {
      processCentre: async (id) => {
        visited.push(id);
      },
      shouldSkip: () => false,
      finish: async () => {
        throw new Error("Synthetic finish failure");
      },
    }),
    /finish failure/,
  );
  assert.deepEqual(visited, [centreId(1), centreId(1)]);
  assert.equal((await state(pg)).after_daycare_id, centreId(1));
  assert.equal((await state(pg)).lease_token, null);
});

test("coordination migration is additive and repeatable with one permitted worker row", async (t) => {
  const { pg, sql } = await database(t, 1);
  await pg.exec(migration);
  await withCentreLeadWorkerBatch(sql, { processCentre: async () => {}, shouldSkip: () => false });
  await pg.exec(migration);
  assert.equal((await state(pg)).after_daycare_id, centreId(1));
  await assert.rejects(
    pg.query("insert into centre_lead_worker_state (id) values ('other-worker')"),
  );
  await assert.rejects(pg.query("update centre_lead_worker_state set lease_token = 'unpaired'"));
  assert.equal(
    (await pg.query("select count(*)::int as n from centre_lead_settings")).rows[0].n,
    1,
  );
});

test("new settings behind and ahead of the cursor join the next bounded wrap without changing preferences", async (t) => {
  const { pg, sql } = await database(t, 25);
  const visited = [];
  const options = {
    processCentre: async (id) => {
      visited.push(id);
    },
    shouldSkip: () => false,
  };
  const settings = async () => (await pg.query(
    "select daycare_id, stale_days, enabled_at from centre_lead_settings order by daycare_id",
  )).rows;
  const original = await settings();
  const first = await withCentreLeadWorkerBatch(sql, options);
  assert.equal(first.selected, 20);
  assert.deepEqual(visited, ids(20));
  assert.equal((await state(pg)).after_daycare_id, centreId(20));
  assert.deepEqual(await settings(), original);

  const added = ["centre-000", "centre-020a", "centre-999"];
  await pg.query(`
    insert into centre_lead_settings (daycare_id, enabled_at, stale_days) values
      ('centre-000', '2026-01-01T09:00:00Z', 7),
      ('centre-020a', '2026-02-02T10:00:00Z', 11),
      ('centre-999', '2026-03-03T11:00:00Z', 5)
  `);
  const enrolled = await settings();
  const second = await withCentreLeadWorkerBatch(sqlFor(pg), options);
  const nextBatch = visited.slice(20);
  assert.equal(second.ok, true);
  assert.equal(second.selected, 20);
  assert.equal(second.attempted, 20);
  assert.equal(second.synced, 20);
  assert.equal(nextBatch.length, 20);
  assert.equal(new Set(nextBatch).size, 20);
  for (const id of [...added, ...ids(25).slice(20)]) {
    assert.ok(nextBatch.includes(id), `Next batch must discover ${id}`);
  }
  assert.deepEqual([...new Set(visited)].sort(), enrolled.map((row) => row.daycare_id));
  assert.deepEqual(await settings(), enrolled);
});
