import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  MB_SOURCE_URL,
  NB_SOURCE_PAGE,
  NB_SOURCE_URL,
  matchVacancyRows,
  normLicence,
  parseMbLocations,
  parseNbCsv,
  provinceCode,
  provincialOpeningLine,
  vacancyEventProps,
  type ListingMatch,
  type MatchedVacancy,
  type ProvincialOpening,
  type SourceVacancy,
} from "@/lib/provincial-vacancy";

const MB_PAGE = "https://childcaresearch.gov.mb.ca/en";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

type RunResult = {
  ok: boolean;
  province: "MB" | "NB";
  event: "vacancy_imported" | "vacancy_import_failed";
  matched: number;
  unmatched: number;
  changed: number;
  reason?: string;
  dryRun: boolean;
};

async function ensureTables() {
  if (!import.meta.env.SSR) return;
  const { ensureProvincialVacancyTables } = await import("./provincial-vacancy-tables");
  await ensureProvincialVacancyTables();
}

function sourceKey(row: SourceVacancy): string {
  const licence = normLicence(row.licence);
  if (licence) return `lic:${licence}`;
  return `place:${row.name.toLowerCase()}|${row.address.toLowerCase()}|${row.city.toLowerCase()}`.slice(0, 180);
}

async function loadListings(): Promise<ListingMatch[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    province: string;
    licence: string | null;
    name: string;
    address: string | null;
    city: string | null;
    claimed: boolean;
    last_vacancy_updated_at: string | null;
  }>`
    select id, province, license_number as licence, name, address, city,
           (claimed_at is not null) as claimed,
           last_vacancy_updated_at
    from daycares
  `.catch(() => []);
  return rows.flatMap((row) => {
    if (!provinceCode(row.province)) return [];
    return [{
      id: row.id,
      province: row.province,
      licence: row.licence || "",
      name: row.name || "",
      address: row.address || "",
      city: row.city || "",
      claimed: Boolean(row.claimed),
      ownVacancy: Boolean(row.claimed) && Boolean(row.last_vacancy_updated_at),
    }];
  });
}

async function openMbSession(): Promise<{ cookie: string; token: string }> {
  const res = await fetch(MB_PAGE, { signal: AbortSignal.timeout(15000), headers: { "user-agent": "KidEase/1.0" } });
  if (!res.ok) throw new Error("mb_page");
  const html = await res.text();
  const token = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1] || "";
  if (!token) throw new Error("mb_token");
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const cookie = parts.map((row) => row.split(";")[0]).filter(Boolean).join("; ");
  return { cookie, token };
}

async function fetchMbLetter(session: { cookie: string; token: string }, letter: string): Promise<unknown> {
  const res = await fetch(MB_SOURCE_URL, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "content-type": "application/json",
      "user-agent": "KidEase/1.0",
      "requestverificationtoken": session.token,
      "x-requested-with": "XMLHttpRequest",
      cookie: session.cookie,
      origin: "https://childcaresearch.gov.mb.ca",
      referer: MB_PAGE,
    },
    body: JSON.stringify({
      searchValue: letter,
      sortValue: "",
      searchByFacilityName: true,
      currentPage: 1,
      isTypeCenter: true,
      isTypeNursery: true,
      isTypeHome: true,
    }),
  });
  if (!res.ok) throw new Error("mb_search");
  return res.json();
}

async function fetchMbRows(fetchedAt: string): Promise<{ ok: true; rows: SourceVacancy[] } | { ok: false; reason: string }> {
  const session = await openMbSession();
  const byKey = new Map<string, SourceVacancy>();
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < LETTERS.length) {
      const letter = LETTERS[cursor];
      cursor += 1;
      if (!letter) continue;
      const payload = await fetchMbLetter(session, letter);
      const parsed = parseMbLocations(payload, fetchedAt);
      if (!parsed.ok) throw new Error(parsed.reason);
      for (const row of parsed.rows) byKey.set(sourceKey(row), row);
    }
  });
  await Promise.all(workers);
  if (!byKey.size) return { ok: false, reason: "empty" };
  return { ok: true, rows: [...byKey.values()] };
}

async function fetchNbRows(fetchedAt: string): Promise<{ ok: true; rows: SourceVacancy[] } | { ok: false; reason: string }> {
  const res = await fetch(NB_SOURCE_URL, { signal: AbortSignal.timeout(20000), headers: { "user-agent": "KidEase/1.0" } });
  if (!res.ok) return { ok: false, reason: "fetch_failed" };
  const parsed = parseNbCsv(await res.text(), fetchedAt);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, rows: parsed.rows };
}

async function writeRows(rows: MatchedVacancy[], dryRun: boolean): Promise<number> {
  if (!rows.length) return 0;
  const sql = await getSql();
  let changed = 0;
  for (const row of rows) {
    const key = sourceKey(row);
    const existing = await sql<{ total: number | null }>`
      select total from provincial_vacancy where province = ${row.province} and source_key = ${key} limit 1
    `.catch(() => [] as Array<{ total: number | null }>);
    const previous = existing[0]?.total;
    const didChange = previous === undefined ? row.total != null : previous !== row.total;
    if (didChange) changed += 1;
    if (dryRun) continue;
    await sql`
      insert into provincial_vacancy (
        id, province, source_key, source_url, fetched_at, source_as_of, licence,
        source_name, source_address, source_city, daycare_id, match_method,
        infant, nursery, preschool, school_age, total, age_label, changed_at, updated_at
      ) values (
        ${nid("pv")}, ${row.province}, ${key}, ${row.sourceUrl}, ${row.fetchedAt}, ${row.asOf}, ${row.licence || null},
        ${row.name}, ${row.address || null}, ${row.city || null}, ${row.daycareId}, ${row.method},
        ${row.infant}, ${row.nursery}, ${row.preschool}, ${row.schoolAge}, ${row.total}, ${row.ageLabel},
        ${didChange ? row.fetchedAt : null}, now()
      )
      on conflict (province, source_key) do update set
        source_url = excluded.source_url,
        fetched_at = excluded.fetched_at,
        source_as_of = excluded.source_as_of,
        licence = excluded.licence,
        source_name = excluded.source_name,
        source_address = excluded.source_address,
        source_city = excluded.source_city,
        daycare_id = excluded.daycare_id,
        match_method = excluded.match_method,
        infant = excluded.infant,
        nursery = excluded.nursery,
        preschool = excluded.preschool,
        school_age = excluded.school_age,
        total = excluded.total,
        age_label = excluded.age_label,
        changed_at = case when provincial_vacancy.total is distinct from excluded.total then excluded.fetched_at else provincial_vacancy.changed_at end,
        updated_at = now()
    `.catch(() => undefined);
  }
  return changed;
}

async function recordRun(input: RunResult & { sourceUrl: string; fetchedAt: string }) {
  const sql = await getSql();
  await sql`
    insert into provincial_vacancy_runs (
      id, province, dry_run, status, reason, source_url, fetched_at, matched, unmatched, changed
    ) values (
      ${nid("pvr")}, ${input.province}, ${input.dryRun}, ${input.event}, ${input.reason || null},
      ${input.sourceUrl}, ${input.fetchedAt}, ${input.matched}, ${input.unmatched}, ${input.changed}
    )
  `.catch(() => undefined);
  const key = String(process.env.VITE_PUBLIC_POSTHOG_KEY || "").trim();
  const host = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  if (!key) return;
  await fetch(`${host}/capture/`, {
    method: "POST",
    signal: AbortSignal.timeout(4000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: input.event,
      distinct_id: "kidease-server",
      properties: vacancyEventProps(input),
    }),
  }).catch(() => undefined);
}

async function importProvince(
  province: "MB" | "NB",
  sourceUrl: string,
  fetchedAt: string,
  dryRun: boolean,
  listings: ListingMatch[],
  loaded: { ok: true; rows: SourceVacancy[] } | { ok: false; reason: string },
): Promise<RunResult> {
  if (!loaded.ok) {
    const result: RunResult = { ok: false, province, event: "vacancy_import_failed", matched: 0, unmatched: 0, changed: 0, reason: loaded.reason, dryRun };
    if (!dryRun) await recordRun({ ...result, sourceUrl, fetchedAt });
    else await recordRun({ ...result, sourceUrl, fetchedAt });
    return result;
  }
  const matchedRows = matchVacancyRows(loaded.rows, listings);
  const matched = matchedRows.filter((row) => row.method !== "unmatched").length;
  const unmatched = matchedRows.length - matched;
  const changed = await writeRows(matchedRows, dryRun);
  const result: RunResult = { ok: true, province, event: "vacancy_imported", matched, unmatched, changed, dryRun };
  await recordRun({ ...result, sourceUrl, fetchedAt });
  return result;
}

export async function runProvincialVacancyJob(input: { dryRun?: boolean } = {}) {
  const dryRun = Boolean(input.dryRun);
  const fetchedAt = new Date().toISOString();
  await ensureTables();
  let listings: ListingMatch[] = [];
  try {
    listings = await loadListings();
  } catch {
    listings = [];
  }
  if (!listings.length) {
    const failed = { ok: false as const, reason: "listings_unavailable" };
    const mb = await importProvince("MB", MB_SOURCE_URL, fetchedAt, dryRun, listings, failed);
    const nb = await importProvince("NB", NB_SOURCE_URL, fetchedAt, dryRun, listings, failed);
    return { ok: false, dryRun, mb, nb };
  }
  const mbLoaded = await fetchMbRows(fetchedAt).catch(() => ({ ok: false as const, reason: "fetch_failed" }));
  const nbLoaded = await fetchNbRows(fetchedAt).catch(() => ({ ok: false as const, reason: "fetch_failed" }));
  const mb = await importProvince("MB", MB_SOURCE_URL, fetchedAt, dryRun, listings, mbLoaded);
  const nb = await importProvince("NB", NB_SOURCE_URL, fetchedAt, dryRun, listings, nbLoaded);
  return { ok: mb.ok || nb.ok, dryRun, mb, nb };
}

export async function listProvincialVacancyReport() {
  await ensureTables();
  const sql = await getSql();
  const runs = await sql<{
    province: string;
    status: string;
    reason: string | null;
    source_url: string;
    fetched_at: string;
    matched: number;
    unmatched: number;
    changed: number;
    dry_run: boolean;
  }>`
    select province, status, reason, source_url, fetched_at, matched, unmatched, changed, dry_run
    from provincial_vacancy_runs
    order by created_at desc
    limit 8
  `.catch(() => []);
  const rows = await sql<{
    province: string;
    source_name: string;
    source_city: string | null;
    licence: string | null;
    match_method: string;
    total: number | null;
    age_label: string;
    fetched_at: string;
    changed_at: string | null;
    source_url: string;
  }>`
    select province, source_name, source_city, licence, match_method, total, age_label, fetched_at, changed_at, source_url
    from provincial_vacancy
    order by updated_at desc
    limit 400
  `.catch(() => []);
  return {
    runs,
    matched: rows.filter((row) => row.match_method !== "unmatched").slice(0, 40),
    unmatched: rows.filter((row) => row.match_method === "unmatched").slice(0, 40),
    changed: rows.filter((row) => row.changed_at).slice(0, 40),
    note: NB_SOURCE_PAGE,
  };
}

export async function stampProvincialOpenings<T extends { id: string; claimed?: boolean; lastVacancyUpdatedAt?: string | null; provincialOpening?: ProvincialOpening | null }>(cards: T[]): Promise<T[]> {
  const ids = cards.map((card) => card.id).filter(Boolean);
  if (!ids.length) return cards;
  const sql = await getSql();
  const rows = await sql.query<{
    daycare_id: string;
    total: number | null;
    source_as_of: string | null;
    fetched_at: string;
    source_url: string;
    age_label: string;
  }>(
    `select daycare_id, total, source_as_of, fetched_at, source_url, age_label
     from provincial_vacancy
     where daycare_id = any($1::text[])
       and match_method in ('licence', 'name_address')`,
    [ids],
  ).catch(() => []);
  const byId = new Map(rows.map((row) => [row.daycare_id, row]));
  return cards.map((card) => {
    const row = byId.get(card.id);
    if (!row) return card;
    const line = provincialOpeningLine({
      total: row.total,
      asOf: row.source_as_of,
      fetchedAt: String(row.fetched_at),
      sourceUrl: row.source_url,
      ageLabel: row.age_label,
      claimedOwnVacancy: Boolean(card.claimed && card.lastVacancyUpdatedAt),
    });
    return line ? { ...card, provincialOpening: line } : card;
  });
}
