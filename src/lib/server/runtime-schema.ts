import { getSql, type Sql } from "@/lib/db";

/** Runtime CREATE TABLE statements. Loaded only on the server. */

export async function ensureAdminFeatureAudit(sql: Sql) {
  await sql`
    create table if not exists admin_feature_audit (
      id text primary key,
      actor_user_id text not null,
      flag_key text not null,
      old_value text not null,
      new_value text not null,
      created_at timestamptz not null default now()
    )
  `;
}

export async function ensureWaitlistMailTable() {
  const sql = await getSql();
  await sql`alter table bookings add column if not exists status_updated_at timestamptz`.catch(() => undefined);
  await sql`
    create table if not exists waitlist_status_mail (
      id text primary key,
      user_id text not null,
      booking_id text not null,
      status text not null,
      daycare_name text not null,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    )
  `.catch(() => undefined);
}

const ENSURE_JOURNALS = `
create table if not exists daily_journals (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  author_user_id text not null,
  day date not null,
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)`;

export async function ensureDailyJournals(sql: Sql) {
  await sql.query(ENSURE_JOURNALS).catch(() => undefined);
}

const ENSURE_CARE_OPS = `
create table if not exists care_rooms (
  id text primary key,
  daycare_id text not null,
  name text not null,
  capacity int not null default 8,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_child_room_assignments (
  id text primary key,
  daycare_id text not null,
  room_id text not null,
  booking_id text,
  child_name text not null,
  parent_user_id text,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_roster_assignments (
  id text primary key,
  daycare_id text not null,
  room_id text not null,
  staff_user_id text not null,
  staff_name text not null,
  day date not null,
  assigned_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists care_medications (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  name text not null,
  dosage text not null,
  instructions text not null default '',
  schedule_times jsonb not null default '[]'::jsonb,
  start_day date not null,
  end_day date,
  created_by text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_medication_logs (
  id text primary key,
  medication_id text not null,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  scheduled_time text not null,
  status text not null,
  notes text not null default '',
  given_by text not null,
  given_by_name text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists care_incidents (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  occurred_at timestamptz not null,
  location text not null default '',
  kind text not null,
  description text not null,
  action_taken text not null default '',
  first_aid boolean not null default false,
  author_user_id text not null,
  author_name text not null default '',
  parent_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists care_child_rooms_child_idx
  on care_child_room_assignments (daycare_id, child_name);
create unique index if not exists care_roster_room_staff_day_idx
  on care_roster_assignments (room_id, staff_user_id, day);
alter table care_rooms add column if not exists age_group text;
create table if not exists care_enrolment_splits (
  booking_id text primary key,
  daycare_id text not null,
  child_name text not null,
  parent_daily_cents int not null,
  program_daily_cents int not null,
  program_kind text not null,
  program_label text not null default '',
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create table if not exists care_day_notes (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  child_name text not null,
  day date not null,
  food text not null default '',
  nap text not null default '',
  incident text not null default '',
  photo text not null default '',
  author_user_id text not null,
  updated_at timestamptz not null default now()
);
create unique index if not exists care_day_notes_child_day
  on care_day_notes (daycare_id, child_name, day);
`;

export async function ensureCareOps(sql: Sql) {
  await sql.query(ENSURE_CARE_OPS).catch(() => undefined);
}

export async function ensureUserNotifications(sql: Sql) {
  await sql
    .query(
      `create table if not exists user_notifications (
        id text primary key,
        user_id text not null,
        kind text not null,
        title_key text not null,
        href text not null,
        source_key text not null,
        daycare_name text,
        status text,
        created_at timestamptz not null default now(),
        read_at timestamptz
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(`create unique index if not exists user_notifications_source_uidx on user_notifications (user_id, source_key)`)
    .catch(() => undefined);
}

export async function ensureLocationTelemetry(sql: Sql) {
  await sql.query(
    `create table if not exists location_telemetry (
        id text primary key,
        kind text not null,
        geohash text not null,
        city text,
        province text,
        radius_km integer,
        slug text,
        session_id text,
        created_at timestamptz not null default now()
      )`,
  );
}

export async function ensureActorMail() {
  const sql = await getSql();
  await sql
    .query(
      `
    create table if not exists actor_mail_sends (
      purpose text not null,
      email text not null,
      winnipeg_day date not null,
      user_id text,
      created_at timestamptz not null default now(),
      primary key (purpose, email, winnipeg_day)
    )
  `,
    )
    .catch(() => undefined);
}

export async function ensureTrustedDevices() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists trusted_devices (
        id text primary key,
        user_id text not null,
        device_id text not null,
        label text,
        user_agent text,
        ip text,
        created_at timestamptz not null default now(),
        last_seen timestamptz not null default now(),
        expires_at timestamptz not null,
        revoked_at timestamptz
      )`,
    )
    .catch(() => undefined);
  await sql
    .query(`create unique index if not exists trusted_devices_user_device on trusted_devices (user_id, device_id)`)
    .catch(() => undefined);
}

export async function ensureDigestSends() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists digest_sends (
        day text primary key,
        sent_at timestamptz not null default now(),
        event_count int not null default 0,
        email_status text not null
      )`,
    )
    .catch(() => undefined);
}

export async function ensurePlatformEvents() {
  const sql = await getSql();
  await sql
    .query(
      `
    create table if not exists platform_events (
      id text primary key,
      kind text not null,
      daycare_name text,
      address text,
      city text,
      province text,
      slug text,
      provider_name text,
      provider_email text,
      listing_url text,
      email_to text not null,
      email_status text not null default 'queued',
      email_error text,
      detail text,
      created_at timestamptz not null default now()
    )
  `,
    )
    .catch(() => undefined);
  await sql.query(`alter table platform_events add column if not exists detail text`).catch(() => undefined);
}

export async function ensureLoginChallenges() {
  const sql = await getSql();
  await sql
    .query(
      `create table if not exists login_challenges (
        id text primary key,
        user_id text not null,
        email text not null,
        code_hash text not null,
        attempts int not null default 0,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      )`,
    )
    .catch(() => undefined);
}

export async function ensureTwoFactorSends(sql: Sql) {
  await sql
    .query(
      `create table if not exists two_factor_sends (
          id text primary key,
          user_id text not null,
          created_at timestamptz not null default now()
        )`,
    )
    .catch(() => undefined);
}
