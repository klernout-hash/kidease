import { AsyncLocalStorage } from "node:async_hooks";

/** The test installs one Postgres connection per case. Server code calls getSql(). */
export const attendanceSql = new AsyncLocalStorage();

export async function getSql() {
  const sql = attendanceSql.getStore();
  if (!sql) throw new Error("attendance test database is not open");
  return sql;
}

export function getSqlWithin() {
  return getSql();
}

export async function getPglite() {
  throw new Error("attendance tests use the tagged SQL connection");
}

export async function ensureDbReady() {}

export const dbSource = "pglite";
