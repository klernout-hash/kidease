import { getSql, type Sql } from "@/lib/db";
import {
  canShareWithCentre,
  FAMILY_DOC_LIMIT,
  isFamilyDocKind,
  shareIsOpen,
  type FamilyDocKind,
} from "@/lib/family-vault";
import { R2_FAMILY_PREFIX } from "@/lib/private-docs";
import { nid } from "@/lib/utils";

export type VaultShare = {
  id: string;
  daycareId: string;
  daycareName: string;
  revokedAt: string | null;
};

export type VaultDocument = {
  id: string;
  kind: FamilyDocKind;
  fileName: string;
  createdAt: string;
  shares: VaultShare[];
};

export type VaultCentre = { id: string; name: string };

export type CentreSharedDoc = {
  shareId: string;
  documentId: string;
  kind: FamilyDocKind;
  fileName: string;
  createdAt: string;
  daycareId: string;
  daycareName: string;
  parentName: string;
};

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function chosenCentreIds(sql: Sql, userId: string): Promise<string[]> {
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from saved_daycares where user_id = ${userId}
    union
    select daycare_id from waitlist_interests where user_id = ${userId}
    union
    select daycare_id from bookings where user_id = ${userId}
    union
    select daycare_id from tour_requests where user_id = ${userId}
    union
    select daycare_id from lead_requests where user_id = ${userId}
  `.catch(() => []);
  return [...new Set(rows.map((row) => row.daycare_id).filter(Boolean))];
}

export async function listParentVault(userId: string): Promise<{ documents: VaultDocument[]; centres: VaultCentre[] }> {
  const sql = await getSql();
  const centreIds = await chosenCentreIds(sql, userId);
  const centres = centreIds.length
    ? await sql
        .query<{ id: string; name: string }>(
          `select id, name from daycares where id = any($1::text[]) order by name`,
          [centreIds],
        )
        .catch(() => [])
    : [];
  const docs = await sql<{
    id: string;
    kind: string;
    file_name: string;
    created_at: string | Date;
  }>`
    select id, kind, file_name, created_at
    from family_documents
    where user_id = ${userId}
    order by created_at desc
    limit 40
  `.catch(() => []);
  const shares = docs.length
    ? await sql
        .query<{
          id: string;
          document_id: string;
          daycare_id: string;
          revoked_at: string | Date | null;
          name: string | null;
        }>(
          `select s.id, s.document_id, s.daycare_id, s.revoked_at, d.name
           from family_document_shares s
           left join daycares d on d.id = s.daycare_id
           where s.document_id = any($1::text[])
           order by s.shared_at desc`,
          [docs.map((doc) => doc.id)],
        )
        .catch(() => [])
    : [];
  return {
    centres: centres.map((centre) => ({ id: centre.id, name: centre.name })),
    documents: docs.flatMap((doc) => {
      if (!isFamilyDocKind(doc.kind) || doc.kind === "immunization") return [];
      return [
        {
          id: doc.id,
          kind: doc.kind,
          fileName: doc.file_name,
          createdAt: iso(doc.created_at) || "",
          shares: shares
            .filter((share) => share.document_id === doc.id)
            .map((share) => ({
              id: share.id,
              daycareId: share.daycare_id,
              daycareName: share.name || "Centre",
              revokedAt: iso(share.revoked_at),
            })),
        },
      ];
    }),
  };
}

export async function saveFamilyDocument(input: {
  userId: string;
  kind: string;
  filename: string;
  mime: string;
  body: Buffer;
}): Promise<{ id: string }> {
  if (!isFamilyDocKind(input.kind) || input.kind === "immunization") {
    throw Object.assign(new Error("bad_kind"), { status: 400 });
  }
  const sql = await getSql();
  const count = await sql<{ n: number }>`
    select count(*)::int as n from family_documents where user_id = ${input.userId}
  `;
  if ((count[0]?.n ?? 0) >= FAMILY_DOC_LIMIT) {
    throw Object.assign(new Error("too_many"), { status: 400 });
  }
  const id = nid("fd");
  const { parsePrivateUpload, persistPrivateDoc } = await import("@/lib/server/private-docs");
  const { safeDocKeyPart } = await import("@/lib/private-docs");
  const parsed = parsePrivateUpload({ body: input.body, mime: input.mime, filename: input.filename });
  if (!parsed.ok) throw Object.assign(new Error("bad_file"), { status: 400 });
  const stored = await persistPrivateDoc({
    prefix: R2_FAMILY_PREFIX,
    keyTail: `${safeDocKeyPart(input.userId)}/${safeDocKeyPart(id)}`,
    body: parsed.body,
    mime: parsed.mime,
  });
  if (!stored.storageRef.startsWith("data:") && !stored.storageRef.startsWith(`${R2_FAMILY_PREFIX}/`)) {
    throw Object.assign(new Error("bad_key"), { status: 400 });
  }
  await sql`
    insert into family_documents (id, user_id, kind, file_name, mime, byte_size, storage_ref)
    values (
      ${id},
      ${input.userId},
      ${input.kind},
      ${parsed.filename.slice(0, 160)},
      ${stored.mime},
      ${parsed.body.byteLength},
      ${stored.storageRef}
    )
  `;
  return { id };
}

export async function shareFamilyDocument(input: {
  userId: string;
  documentId: string;
  daycareId: string;
}): Promise<{ shareId: string }> {
  const sql = await getSql();
  const docs = await sql<{ id: string }>`
    select id from family_documents where id = ${input.documentId} and user_id = ${input.userId} limit 1
  `;
  if (!docs[0]) throw Object.assign(new Error("not_found"), { status: 404 });
  const chosen = await chosenCentreIds(sql, input.userId);
  if (!canShareWithCentre(input.daycareId, chosen)) {
    throw Object.assign(new Error("centre_not_chosen"), { status: 400 });
  }
  const open = await sql<{ id: string }>`
    select id from family_document_shares
    where document_id = ${input.documentId} and daycare_id = ${input.daycareId} and revoked_at is null
    limit 1
  `;
  if (open[0]) return { shareId: open[0].id };
  const shareId = nid("fs");
  await sql`
    insert into family_document_shares (id, document_id, daycare_id)
    values (${shareId}, ${input.documentId}, ${input.daycareId})
  `;
  return { shareId };
}

export async function revokeFamilyShare(input: { userId: string; shareId: string }): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    update family_document_shares s
    set revoked_at = now()
    from family_documents d
    where s.id = ${input.shareId}
      and s.document_id = d.id
      and d.user_id = ${input.userId}
      and s.revoked_at is null
    returning s.id
  `;
  if (!rows[0]) throw Object.assign(new Error("not_found"), { status: 404 });
}

export async function deleteFamilyDocument(input: { userId: string; documentId: string }): Promise<void> {
  const sql = await getSql();
  const rows = await sql<{ storage_ref: string }>`
    select storage_ref from family_documents
    where id = ${input.documentId} and user_id = ${input.userId}
    limit 1
  `;
  const ref = rows[0]?.storage_ref;
  if (!ref) throw Object.assign(new Error("not_found"), { status: 404 });
  await forgetStorage(ref);
  await sql`delete from family_documents where id = ${input.documentId} and user_id = ${input.userId}`;
}

export async function listCentreFamilyDocs(userId: string): Promise<CentreSharedDoc[]> {
  const sql = await getSql();
  const { listAccessibleDaycareIds } = await import("@/lib/server/centre-access");
  const centreIds = await listAccessibleDaycareIds(sql, userId);
  if (!centreIds.length) return [];
  const rows = await sql
    .query<{
      share_id: string;
      document_id: string;
      kind: string;
      file_name: string;
      created_at: string | Date;
      daycare_id: string;
      daycare_name: string;
      parent_name: string | null;
    }>(
      `select s.id as share_id, d.id as document_id, d.kind, d.file_name, d.created_at,
              s.daycare_id, c.name as daycare_name, u.name as parent_name
       from family_document_shares s
       join family_documents d on d.id = s.document_id
       join daycares c on c.id = s.daycare_id
       left join "user" u on u.id = d.user_id
       where s.revoked_at is null and s.daycare_id = any($1::text[])
       order by s.shared_at desc
       limit 40`,
      [centreIds],
    )
    .catch(() => []);
  return rows.flatMap((row) => {
    if (!isFamilyDocKind(row.kind) || row.kind === "immunization") return [];
    return [
      {
        shareId: row.share_id,
        documentId: row.document_id,
        kind: row.kind,
        fileName: row.file_name,
        createdAt: iso(row.created_at) || "",
        daycareId: row.daycare_id,
        daycareName: row.daycare_name,
        parentName: (row.parent_name || "").trim() || "Parent",
      },
    ];
  });
}

export async function loadFamilyDocumentFor(input: {
  userId: string;
  documentId: string;
}): Promise<{ storageRef: string; mime: string; fileName: string }> {
  const sql = await getSql();
  const owned = await sql<{ storage_ref: string; mime: string; file_name: string }>`
    select storage_ref, mime, file_name from family_documents
    where id = ${input.documentId} and user_id = ${input.userId}
    limit 1
  `;
  if (owned[0]) {
    return { storageRef: owned[0].storage_ref, mime: owned[0].mime, fileName: owned[0].file_name };
  }
  const shared = await sql<{ storage_ref: string; mime: string; file_name: string; daycare_id: string; revoked_at: string | Date | null }>`
    select d.storage_ref, d.mime, d.file_name, s.daycare_id, s.revoked_at
    from family_documents d
    join family_document_shares s on s.document_id = d.id
    where d.id = ${input.documentId}
    order by s.shared_at desc
    limit 8
  `;
  const { hasCentreDeskAccess } = await import("@/lib/server/centre-access");
  for (const row of shared) {
    if (!shareIsOpen(iso(row.revoked_at))) continue;
    if (await hasCentreDeskAccess(sql, input.userId, row.daycare_id)) {
      return { storageRef: row.storage_ref, mime: row.mime, fileName: row.file_name };
    }
  }
  throw Object.assign(new Error("not_found"), { status: 404 });
}

async function forgetStorage(ref: string) {
  const value = ref.trim();
  if (!value.startsWith(`${R2_FAMILY_PREFIX}/`)) return;
  try {
    const { resolveR2Config } = await import("@/lib/server/r2");
    if (!resolveR2Config().ok) return;
    const { deleteFamilyDocObject } = await import("@/lib/server/r2.server");
    await deleteFamilyDocObject(value);
  } catch {
    /* The row delete still removes access. */
  }
}

export async function purgeFamilyDocuments(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ storage_ref: string }>`
    select storage_ref from family_documents where user_id = ${userId}
  `.catch(() => []);
  for (const row of rows) await forgetStorage(row.storage_ref);
  await sql`delete from family_documents where user_id = ${userId}`.catch(() => undefined);
}
