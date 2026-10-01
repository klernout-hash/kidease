import type { Sql } from "@/lib/db";

/** Admin queue tables. Imported only on the server so the SQL stays out of the browser. */
export async function ensureAdminToolTables(sql: Sql) {
  await sql`
    create table if not exists admin_truth_queue (
      id text primary key,
      daycare_id text not null,
      field text not null,
      current_value text not null default '',
      proposed_value text not null,
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      decided_at timestamptz,
      decided_by text
    )
  `;
  await sql`
    create table if not exists admin_licence_reads (
      id text primary key,
      upload_id text,
      daycare_id text,
      centre_name text not null default '',
      licence_number text,
      holder_name text,
      expiry text,
      confirmed int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists admin_spam_queue (
      id text primary key,
      kind text not null,
      score int not null,
      reasons text not null default '',
      excerpt text not null default '',
      email text,
      source_id text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists admin_support_drafts (
      id text primary key,
      case_id text,
      tag text not null,
      draft text not null,
      sent int not null default 0,
      created_at timestamptz not null default now()
    )
  `;
}
