#!/usr/bin/env node
/**
 * Retire duplicate daycare listings.
 *
 * Dry-run by default. Pass --apply to write. This never deletes a daycare row.
 * A JSON backup and a guarded rollback SQL file are written before the transaction.
 * Contact values are written only into that backup. The console prints counts.
 *
 *   node --experimental-strip-types scripts/merge-duplicate-listings.mjs --groups groups.json
 *   node --experimental-strip-types scripts/merge-duplicate-listings.mjs --groups groups.json --facts facts.json --children children.json
 *   DATABASE_URL='postgresql://…' node --experimental-strip-types scripts/merge-duplicate-listings.mjs --groups groups.json
 *   DATABASE_URL='postgresql://…' node --experimental-strip-types scripts/merge-duplicate-listings.mjs --groups groups.json --apply
 *
 * --facts and --children are fixture overlays for a dry-run. --apply always reads
 * daycares from DATABASE_URL and refuses those flags.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvRecords } from "../src/lib/catalog-master.ts";
import {
  planDuplicateMerges,
  planExplicitDuplicateMerges,
  planAddressReviewHides,
  rollbackInputsForPlan,
  buildRollbackSql,
  hideRollbackInputs,
} from "../src/lib/listing-merge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function option(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : "";
  if (next && !next.startsWith("--")) return next;
  return "";
}

function asText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function photoCount(photos) {
  return asText(photos)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadGroups(path) {
  const parsed = loadJson(path);
  const groups = Array.isArray(parsed) ? parsed : parsed.groups;
  if (!Array.isArray(groups)) throw new Error("--groups must be a JSON array or { groups: [] }");
  return groups;
}

function csvRecords(path) {
  const table = parseCsvRecords(readFileSync(path, "utf8"));
  if (table.length < 2) return [];
  const header = table[0].map((cell) => cell.trim());
  return table.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = row[index] || "";
    });
    return record;
  });
}

function isCsv(path) {
  return path.toLowerCase().endsWith(".csv");
}

function emptyChild(daycareId, photos) {
  return {
    daycareId,
    enquiryIds: [],
    tourIds: [],
    leadIds: [],
    savedUserIds: [],
    reviewIds: [],
    availabilityMonths: [],
    viewDays: [],
    conversations: [],
    photos: photos || "",
    photoCount: photoCount(photos),
    waitlistUserIds: [],
    claimIds: [],
    ownerUserIds: [],
  };
}

function indexChildren(list) {
  const map = new Map();
  for (const row of list || []) {
    if (!row || !row.daycareId) continue;
    map.set(row.daycareId, row);
  }
  return map;
}

function factsFromDbRow(row) {
  return {
    id: row.id,
    slug: asText(row.slug),
    name: asText(row.name),
    address: asText(row.address),
    city: asText(row.city),
    province: asText(row.province),
    claimedAt: asText(row.claimed_at),
    claimStatus: asText(row.claim_status) || "unclaimed",
    createdAt: asText(row.created_at),
    website: asText(row.website),
    contactEmail: asText(row.contact_email),
    phone: asText(row.phone),
    postalCode: asText(row.postal_code),
    licenseNumber: asText(row.license_number),
    licenseStatus: asText(row.license_status),
    description: asText(row.description),
    ageMinMonths: row.age_min_months,
    ageMaxMonths: row.age_max_months,
    infantMonthly: row.infant_monthly,
    toddlerMonthly: row.toddler_monthly,
    preschoolMonthly: row.preschool_monthly,
    partTimeMonthly: row.part_time_monthly,
    photoCount: photoCount(row.photos),
    photos: asText(row.photos),
    enquiryCount: Number(row.enquiry_count) || 0,
    leadCount: Number(row.lead_count) || 0,
    messageCount: Number(row.message_count) || 0,
    listingActive: row.listing_active,
    visibility: asText(row.visibility) || "public",
    mergedInto: asText(row.merged_into),
    importFault: asText(row.import_fault),
    ownerCount: Number(row.owner_count) || 0,
  };
}

async function loadLive(databaseUrl, ids) {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const facts = await client.query(
      `select d.id, d.slug, d.name, d.address, d.city, d.province, d.claimed_at, d.claim_status, d.created_at,
              d.website, d.contact_email, d.phone, d.postal_code,
              d.license_number, d.license_status, d.description,
              d.age_min_months, d.age_max_months,
              d.infant_monthly, d.toddler_monthly, d.preschool_monthly, d.part_time_monthly,
              d.photos, d.listing_active, d.visibility, d.merged_into, d.import_fault,
              (
                (select count(*)::int from provider_daycares p where p.daycare_id = d.id)
                + (select count(*)::int from listing_claims lc
                    where lc.daycare_id = d.id
                      and coalesce(lc.status, '') not in ('rejected', 'withdrawn', 'cancelled'))
                + (select count(*)::int from centre_members cm
                    where cm.daycare_id = d.id and cm.status = 'active')
              ) as owner_count,
              (select count(*)::int from bookings b where b.daycare_id = d.id) as enquiry_count,
              (select count(*)::int from lead_requests l where l.daycare_id = d.id) as lead_count,
              (select count(*)::int from messages m
                 join conversations c on c.id = m.conversation_id
                where c.daycare_id = d.id) as message_count
         from daycares d
        where d.id = any($1::text[])`,
      [ids],
    );
    const [enquiries, tours, leads, saved, reviews, availability, views, conversations, waitlists, claims, owners] = await Promise.all([
      client.query(`select id, daycare_id from bookings where daycare_id = any($1::text[])`, [ids]),
      client.query(`select id, daycare_id from tour_requests where daycare_id = any($1::text[])`, [ids]),
      client.query(`select id, daycare_id from lead_requests where daycare_id = any($1::text[])`, [ids]),
      client.query(`select user_id, daycare_id from saved_daycares where daycare_id = any($1::text[])`, [ids]),
      client.query(`select id, daycare_id from reviews where daycare_id = any($1::text[])`, [ids]),
      client.query(`select daycare_id, month from availability where daycare_id = any($1::text[])`, [ids]),
      client.query(`select daycare_id, viewed_on from daycare_views where daycare_id = any($1::text[])`, [ids]),
      client.query(`select id, user_id, daycare_id from conversations where daycare_id = any($1::text[])`, [ids]),
      client.query(`select user_id, daycare_id from waitlist_interests where daycare_id = any($1::text[])`, [ids]),
      client.query(
        `select id, user_id, daycare_id from listing_claims
          where daycare_id = any($1::text[])
            and coalesce(status, '') not in ('rejected', 'withdrawn', 'cancelled')`,
        [ids],
      ),
      client.query(`select user_id, daycare_id from provider_daycares where daycare_id = any($1::text[])`, [ids]),
    ]);
    const byId = new Map(facts.rows.map((row) => [row.id, factsFromDbRow(row)]));
    const children = new Map();
    for (const row of facts.rows) children.set(row.id, emptyChild(row.id, row.photos));
    const push = (rows, key, value) => {
      for (const row of rows) {
        const bucket = children.get(row.daycare_id);
        if (!bucket) continue;
        bucket[key].push(value(row));
      }
    };
    push(enquiries.rows, "enquiryIds", (row) => row.id);
    push(tours.rows, "tourIds", (row) => row.id);
    push(leads.rows, "leadIds", (row) => row.id);
    push(saved.rows, "savedUserIds", (row) => row.user_id);
    push(reviews.rows, "reviewIds", (row) => row.id);
    push(availability.rows, "availabilityMonths", (row) => row.month);
    push(views.rows, "viewDays", (row) => row.viewed_on);
    push(conversations.rows, "conversations", (row) => ({ id: row.id, userId: row.user_id }));
    push(waitlists.rows, "waitlistUserIds", (row) => row.user_id);
    push(claims.rows, "claimIds", (row) => row.id);
    push(owners.rows, "ownerUserIds", (row) => row.user_id);
    return { byId, children, client, pool };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}

function printPlan(plan, groups) {
  const byKeeper = new Map();
  for (const group of groups) {
    for (const row of group.rows || []) byKeeper.set(row.id, (row.province || "").toUpperCase());
  }
  const provinces = new Map();
  let licenceNormalized = 0;
  for (const group of plan.groups) {
    if (group.keeperLicence) licenceNormalized += 1;
    const province = byKeeper.get(group.keeperId) || "?";
    const tally = provinces.get(province) || { keepers: 0, retired: 0 };
    tally.keepers += 1;
    tally.retired += group.retiredIds.length;
    provinces.set(province, tally);
  }
  console.log(`[merge-duplicates] keepers ${plan.keepers}`);
  console.log(`[merge-duplicates] retired ${plan.retired}`);
  console.log(`[merge-duplicates] fieldsFilled ${plan.fieldsFilled}`);
  console.log(`[merge-duplicates] childRecordsMoved ${plan.childRecordsMoved}`);
  console.log(`[merge-duplicates] licenceNormalized ${licenceNormalized}`);
  const notSame = plan.skipped.filter((row) => row.reason === "not the same centre").length;
  const leftSeparate = plan.groups.reduce((sum, group) => sum + (group.unrelatedIds || []).length, 0);
  console.log(`[merge-duplicates] skipped ${plan.skipped.length}`);
  console.log(`[merge-duplicates] skippedNotSameCentre ${notSame}`);
  console.log(`[merge-duplicates] leftSeparate ${leftSeparate}`);
  const hidden = plan.hiddenReviews || [];
  console.log(`[merge-duplicates] hiddenReview ${hidden.length}`);
  for (const item of hidden) {
    const names = (item.names || []).join(" / ") || `${item.liveId} / ${item.hiddenId}`;
    const addresses = (item.addresses || []).join(" | ");
    console.log(`[merge-duplicates] hiddenReview ${names}${addresses ? ` | ${addresses}` : ""}`);
  }
  // PEI city/postal names are hidden by repair-pei-names, not by this merge.
  console.log(`[merge-duplicates] peiHidden 0`);
  for (const [province, tally] of [...provinces.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`[merge-duplicates] province ${province} keepers ${tally.keepers} retired ${tally.retired}`);
  }
}

async function applyPlan(client, plan, factsById) {
  for (const group of plan.groups) {
    const fills = group.fieldFills;
    const blanks = [
      ["website", "website", fills.website],
      ["contact_email", "contactEmail", fills.contactEmail],
      ["phone", "phone", fills.phone],
      ["postal_code", "postalCode", fills.postalCode],
    ];
    for (const [column, , value] of blanks) {
      if (!value) continue;
      await client.query(
        `update daycares set ${column} = $1 where id = $2 and nullif(btrim(coalesce(${column}, '')), '') is null`,
        [value, group.keeperId],
      );
    }
    if (group.keeperLicence) {
      await client.query(
        `update daycares set license_number = $1 where id = $2 and license_number is distinct from $1`,
        [group.keeperLicence, group.keeperId],
      );
    }
    for (const move of group.retiredMoves) {
      if (move.photos) {
        await client.query(
          `update daycares set photos = $1 where id = $2 and nullif(btrim(coalesce(photos, '')), '') is null`,
          [move.photos, group.keeperId],
        );
      }
      const moves = [
        ["bookings", move.moved.enquiryIds],
        ["tour_requests", move.moved.tourIds],
        ["lead_requests", move.moved.leadIds],
        ["reviews", move.moved.reviewIds],
      ];
      for (const [table, ids] of moves) {
        if (ids.length === 0) continue;
        await client.query(
          `update ${table} set daycare_id = $1 where id = any($2::text[]) and daycare_id = $3`,
          [group.keeperId, ids, move.retiredId],
        );
      }
      if (move.moved.conversationIds.length > 0) {
        await client.query(
          `update conversations set daycare_id = $1
            where id = any($2::text[])
              and daycare_id = $3
              and not exists (
                select 1 from conversations keeper_row
                where keeper_row.user_id = conversations.user_id
                  and keeper_row.daycare_id = $1
              )`,
          [group.keeperId, move.moved.conversationIds, move.retiredId],
        );
      }
      if (move.moved.savedUserIds.length > 0) {
        await client.query(
          `update saved_daycares set daycare_id = $1
            where user_id = any($2::text[])
              and daycare_id = $3
              and not exists (
                select 1 from saved_daycares keeper_row
                where keeper_row.user_id = saved_daycares.user_id
                  and keeper_row.daycare_id = $1
              )`,
          [group.keeperId, move.moved.savedUserIds, move.retiredId],
        );
      }
      if (move.moved.availabilityMonths.length > 0) {
        await client.query(
          `update availability set daycare_id = $1
            where daycare_id = $2
              and month = any($3::text[])
              and not exists (
                select 1 from availability keeper_row
                where keeper_row.daycare_id = $1
                  and keeper_row.month = availability.month
              )`,
          [group.keeperId, move.retiredId, move.moved.availabilityMonths],
        );
      }
      if (move.moved.viewDays.length > 0) {
        await client.query(
          `update daycare_views set daycare_id = $1
            where daycare_id = $2
              and viewed_on = any($3::text[])
              and not exists (
                select 1 from daycare_views keeper_row
                where keeper_row.daycare_id = $1
                  and keeper_row.viewed_on = daycare_views.viewed_on
              )`,
          [group.keeperId, move.retiredId, move.moved.viewDays],
        );
      }
      if ((move.moved.waitlistUserIds || []).length > 0) {
        await client.query(
          `update waitlist_interests set daycare_id = $1
            where user_id = any($2::text[])
              and daycare_id = $3
              and not exists (
                select 1 from waitlist_interests keeper_row
                where keeper_row.user_id = waitlist_interests.user_id
                  and keeper_row.daycare_id = $1
              )`,
          [group.keeperId, move.moved.waitlistUserIds, move.retiredId],
        );
      }
      if ((move.moved.claimIds || []).length > 0) {
        await client.query(
          `update listing_claims set daycare_id = $1
            where id = any($2::text[])
              and daycare_id = $3
              and not exists (
                select 1 from listing_claims keeper_row
                where keeper_row.user_id = listing_claims.user_id
                  and keeper_row.daycare_id = $1
              )`,
          [group.keeperId, move.moved.claimIds, move.retiredId],
        );
      }
      if ((move.moved.ownerUserIds || []).length > 0) {
        await client.query(
          `update provider_daycares set daycare_id = $1
            where user_id = any($2::text[])
              and daycare_id = $3
              and not exists (
                select 1 from provider_daycares keeper_row
                where keeper_row.user_id = provider_daycares.user_id
                  and keeper_row.daycare_id = $1
              )`,
          [group.keeperId, move.moved.ownerUserIds, move.retiredId],
        );
      }
      await client.query(
        `update daycares
            set merged_into = $1,
                listing_active = 0,
                claim_status = 'superseded'
          where id = $2
            and (merged_into is null or merged_into = $1)`,
        [group.keeperId, move.retiredId],
      );
    }
  }
  for (const action of plan.hiddenReviews || []) {
    await client.query(
      `update daycares
          set listing_active = 0,
              visibility = 'admin_only',
              import_fault = $1,
              review_of = $2
        where id = $3
          and merged_into is null
          and (import_fault is null or import_fault = $1)`,
      [action.flag, action.liveId, action.hiddenId],
    );
  }
  const { localCatalogMatchIds, persistLocalLicenseMatches } = await import("../src/lib/server/license-match.ts");
  const matchIds = localCatalogMatchIds(
    plan.groups.map((group) => {
      const fact = factsById.get(group.keeperId);
      return {
        id: group.keeperId,
        province: fact?.province || "",
        licenseNumber: group.keeperLicence || fact?.licenseNumber || "",
      };
    }),
  );
  await persistLocalLicenseMatches(client, matchIds);
}

function loadExplicitPairs(path) {
  return csvRecords(path)
    .map((row) => ({
      duplicateId: (row.duplicate_site_id || "").trim(),
      keeperId: (row.keeper_site_id || "").trim(),
      duplicateSlug: (row.duplicate_slug || "").trim(),
      keeperSlug: (row.keeper_slug || "").trim(),
      name: row.name || "",
      keeperName: row.keeper_name || "",
      address: row.duplicate_address || "",
      keeperAddress: row.keeper_address || "",
      city: row.city || "",
      province: row.province || "",
      postalCode: row.postal || "",
      keeperPostal: row.keeper_postal || "",
    }))
    .filter((row) => row.duplicateId && row.keeperId);
}

function loadExcludedKeys(path) {
  const ids = new Set();
  const slugs = new Set();
  for (const row of csvRecords(path)) {
    for (const key of ["duplicate_site_id", "site_id", "keeper_site_id"]) {
      const value = (row[key] || "").trim();
      if (value) ids.add(value);
    }
    for (const key of ["duplicate_slug", "slug", "keeper_slug"]) {
      const value = (row[key] || "").trim();
      if (value) slugs.add(value);
    }
  }
  return { ids, slugs };
}

function loadKeeperSlugs(path) {
  const centres = loadJson(path);
  const bySlug = new Map();
  for (const row of centres) {
    if (row && row.slug && row.id) bySlug.set(String(row.slug).toLowerCase(), String(row.id));
  }
  return bySlug;
}

function loadReviewPairs(path, keeperIdsBySlug) {
  return csvRecords(path)
    .map((row) => {
      const keeperSlug = (row.keeper_slug || "").trim();
      const keeperId = keeperIdsBySlug.get(keeperSlug.toLowerCase()) || "";
      return {
        duplicateId: (row.site_id || "").trim(),
        keeperId,
        duplicateSlug: (row.slug || "").trim(),
        keeperSlug,
        names: [row.name || ""].filter(Boolean),
        addresses: [row.address || ""].filter(Boolean),
        city: row.city || "",
        province: row.province || "",
      };
    })
    .filter((row) => row.duplicateId);
}

function assertNoExcluded(pairs, excluded) {
  const hits = pairs.filter(
    (pair) =>
      excluded.ids.has(pair.duplicateId) ||
      excluded.ids.has(pair.keeperId) ||
      excluded.slugs.has(pair.duplicateSlug) ||
      excluded.slugs.has(pair.keeperSlug),
  );
  if (hits.length > 0) {
    throw new Error(`${hits.length} pairs are on the do-not-merge list`);
  }
}

function printSkips(label, skipped) {
  const reasons = new Map();
  for (const row of skipped) reasons.set(row.reason, (reasons.get(row.reason) || 0) + 1);
  console.log(`[merge-duplicates] ${label} ${skipped.length}`);
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`[merge-duplicates] ${label} ${reason} ${count}`);
  }
  for (const row of skipped) {
    if (row.reason === "both claimed" || row.reason === "protected listing" || row.reason === "claimed duplicate left public") {
      console.log(`[merge-duplicates] ${label} row ${row.duplicateId} -> ${row.keeperId} ${row.reason}`);
    }
  }
}

async function main() {
  const apply = flag("apply");
  const groupsPath = option("groups");
  const factsPath = option("facts");
  const childrenPath = option("children");
  const excludePath = option("exclude");
  const reviewPath = option("review");
  if (!groupsPath) {
    console.error("[merge-duplicates] pass --groups path/to/duplicate-groups.json");
    process.exit(1);
  }
  if (apply && (factsPath || childrenPath)) {
    console.error("[merge-duplicates] --apply reads listings from DATABASE_URL. Omit --facts and --children.");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL || "";
  if (apply && !databaseUrl) {
    console.error("[merge-duplicates] --apply needs DATABASE_URL. A dry-run does not.");
    process.exit(1);
  }
  const explicit = isCsv(groupsPath);
  const pairs = explicit ? loadExplicitPairs(resolve(groupsPath)) : [];
  const excluded = excludePath ? loadExcludedKeys(resolve(excludePath)) : { ids: new Set(), slugs: new Set() };
  if (explicit) assertNoExcluded(pairs, excluded);
  const reviewPairs = reviewPath
    ? loadReviewPairs(resolve(reviewPath), loadKeeperSlugs(join(root, "src/lib/data/centres.json")))
    : [];
  if (reviewPairs.some((row) => !row.keeperId)) {
    const missingKeepers = reviewPairs.filter((row) => !row.keeperId).length;
    throw new Error(`${missingKeepers} review rows have no keeper id`);
  }
  const groups = explicit
    ? pairs.map((pair) => ({
        rows: [
          { id: pair.duplicateId, province: pair.province, slug: pair.duplicateSlug, name: pair.name, address: pair.address },
          { id: pair.keeperId, province: pair.province, slug: pair.keeperSlug, name: pair.keeperName, address: pair.keeperAddress },
        ],
      }))
    : loadGroups(resolve(groupsPath));
  const ids = explicit
    ? [...new Set([...pairs.flatMap((pair) => [pair.duplicateId, pair.keeperId]), ...reviewPairs.flatMap((pair) => [pair.duplicateId, pair.keeperId])])]
    : [...new Set(groups.flatMap((group) => (group.rows || []).map((row) => row.id).filter(Boolean)))];
  let factsById = new Map();
  let children = indexChildren(childrenPath ? loadJson(resolve(childrenPath)) : []);
  if (factsPath) {
    for (const row of loadJson(resolve(factsPath))) factsById.set(row.id, row);
  }
  if (explicit && !factsPath) {
    for (const pair of pairs) {
      if (!factsById.has(pair.duplicateId)) {
        factsById.set(pair.duplicateId, {
          id: pair.duplicateId,
          slug: pair.duplicateSlug,
          name: pair.name,
          address: pair.address,
          city: pair.city,
          province: pair.province,
          postalCode: pair.postalCode,
          claimStatus: "unclaimed",
        });
      }
      if (!factsById.has(pair.keeperId)) {
        factsById.set(pair.keeperId, {
          id: pair.keeperId,
          slug: pair.keeperSlug,
          name: pair.keeperName,
          address: pair.keeperAddress,
          city: pair.city,
          province: pair.province,
          postalCode: pair.keeperPostal,
          claimStatus: "unclaimed",
        });
      }
    }
  }
  let live = null;
  if (databaseUrl && !factsPath) {
    live = await loadLive(databaseUrl, ids);
    factsById = live.byId;
    children = live.children;
    const missing = ids.filter((id) => !factsById.has(id));
    if (missing.length > 0) {
      console.error(`[merge-duplicates] ${missing.length} listing ids are not in daycares.`);
      if (apply) {
        live.client.release();
        await live.pool.end();
        process.exit(1);
      }
    }
  }
  let swaps = [];
  let explicitSkips = [];
  let plan;
  if (explicit) {
    if (!databaseUrl) {
      console.log("[merge-duplicates] claims not checked (no DATABASE_URL)");
    } else {
      console.log("[merge-duplicates] claims checked");
    }
    const explicitPlan = planExplicitDuplicateMerges(pairs, factsById, children);
    plan = explicitPlan.plan;
    swaps = explicitPlan.swaps;
    explicitSkips = explicitPlan.skipped;
    const reviews = planAddressReviewHides(reviewPairs, factsById);
    plan.hiddenReviews = reviews.hides;
    plan.hiddenReview = reviews.hides.length;
    printSkips("skipped", explicitSkips);
    printSkips("reviewSkipped", reviews.skipped);
    console.log(`[merge-duplicates] swaps ${swaps.length}`);
    for (const swap of swaps) {
      console.log(`[merge-duplicates] swap keeper ${swap.keeperSlug || swap.keeperId} duplicate was ${swap.duplicateSlug || swap.duplicateId}`);
    }
    console.log(`[merge-duplicates] reviewQueued ${reviews.hides.length}`);
  } else {
    plan = planDuplicateMerges(groups, factsById, children);
  }
  printPlan(plan, groups);
  console.log(`[merge-duplicates] mode ${apply ? "apply" : "dry-run"}`);
  if (!apply) {
    if (live) {
      live.client.release();
      await live.pool.end();
    }
    return;
  }
  const backupDir = join(root, "tmp", "merge-duplicates");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `${stamp}-backup.json`);
  const rollbackPath = join(backupDir, `${stamp}-rollback.sql`);
  const rollback = buildRollbackSql(rollbackInputsForPlan(plan, factsById), hideRollbackInputs(plan, factsById));
  const before = plan.groups.map((group) => {
    const fact = factsById.get(group.keeperId) || {};
    return {
      id: group.keeperId,
      website: fact.website || "",
      contactEmail: fact.contactEmail || "",
      phone: fact.phone || "",
      postalCode: fact.postalCode || "",
      licenseNumber: fact.licenseNumber || "",
      photos: fact.photos || "",
      claimStatus: fact.claimStatus || "",
    };
  });
  writeFileSync(
    backupPath,
    `${JSON.stringify({ createdAt: new Date().toISOString(), groupsFile: resolve(groupsPath), plan, before }, null, 2)}\n`,
  );
  writeFileSync(rollbackPath, rollback);
  console.log(`[merge-duplicates] backup ${backupPath}`);
  console.log(`[merge-duplicates] rollback ${rollbackPath}`);
  try {
    await live.client.query("BEGIN");
    await applyPlan(live.client, plan, factsById);
    await live.client.query("COMMIT");
  } catch (error) {
    try {
      await live.client.query("ROLLBACK");
    } catch {
      // Keep the original error when the connection is already closed.
    }
    console.error("[merge-duplicates] apply rolled back. Do not run the rollback file.");
    throw error;
  } finally {
    live.client.release();
    await live.pool.end();
  }
  console.log("[merge-duplicates] apply committed");
}

main().catch((error) => {
  console.error(`[merge-duplicates] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
