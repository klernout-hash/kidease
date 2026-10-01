type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

type Sql = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

type PgliteGlobal = typeof globalThis & {
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (value: string) => value;

/**
 * Embedded Postgres for preview. The SQL files are bundled here, on the server
 * only, so the browser never downloads the schema.
 */
export async function openPgliteSql(globalRef: PgliteGlobal, toSql: (run: Run) => Sql): Promise<Sql> {
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>("select name from _migrations");
    const done = new Set(doneRows.rows.map((row) => row.name));
    for (const [path, text] of Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b))) {
      const name = path.split("/").pop() as string;
      if (done.has(name)) continue;
      // PostGIS is Neon-only. Record the file so preview stays aligned with
      // migrate.mjs without failing CREATE EXTENSION on PGLite.
      if (name.includes("geography") || name.includes("postgis")) {
        await pg.query("insert into _migrations (name) values ($1)", [name]);
        continue;
      }
      await pg.transaction(async (tx) => {
        await tx.exec(text);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve()).catch(() => undefined).then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  return toSql(async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  });
}
