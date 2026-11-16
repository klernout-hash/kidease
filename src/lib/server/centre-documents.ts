import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  buildCentreChecklist,
  documentsVerifiedBadge,
  isPolicyKey,
  type ChecklistScore,
  type DocReviewStatus,
  type PolicyKey,
  type StoredCentreDoc,
} from "@/lib/centre-documents";
import { centreDocumentsEnabled } from "@/lib/features";
import { R2_CENTRE_DOC_PREFIX } from "@/lib/private-docs";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { parsePrivateUpload, persistPrivateDoc } from "@/lib/server/private-docs";
import { requireAdmin, resolveAdminAccess } from "@/lib/server/roles";
import { nid } from "@/lib/utils";

type DocRow = {
  id: string;
  daycare_id: string;
  kind: string;
  policy_key: string | null;
  filename: string | null;
  mime: string | null;
  storage_ref: string | null;
  expires_on: string | null;
  review_status: string | null;
  review_reason: string | null;
};

function asReview(value: string | null | undefined): DocReviewStatus {
  if (value === "approved" || value === "rejected") return value;
  return "pending";
}

function toStored(row: DocRow): StoredCentreDoc | null {
  if (row.kind !== "insurance" && row.kind !== "policy" && row.kind !== "handbook") return null;
  return {
    id: row.id,
    kind: row.kind,
    policyKey: isPolicyKey(row.policy_key) ? row.policy_key : null,
    filename: row.filename,
    expiresOn: row.expires_on ? String(row.expires_on).slice(0, 10) : null,
    reviewStatus: asReview(row.review_status),
    reviewReason: row.review_reason,
  };
}

async function rowsFor(sql: Sql, daycareId: string): Promise<StoredCentreDoc[]> {
  const rows = await sql<DocRow>`
    select id, daycare_id, kind, policy_key, filename, mime, storage_ref, expires_on::text as expires_on, review_status, review_reason
    from centre_documents
    where daycare_id = ${daycareId}
    order by id desc
  `;
  return rows.map(toStored).filter((row): row is StoredCentreDoc => Boolean(row));
}

async function centreFacts(sql: Sql, daycareId: string) {
  const rows = await sql<{
    id: string;
    name: string;
    province: string | null;
    license_photo: string | null;
    claim_status: string | null;
    screening_on_file: number | boolean | null;
  }>`
    select id, name, province, license_photo, claim_status, screening_on_file
    from daycares where id = ${daycareId} limit 1
  `;
  return rows[0] || null;
}

function scoreFor(
  centre: NonNullable<Awaited<ReturnType<typeof centreFacts>>>,
  documents: StoredCentreDoc[],
): ChecklistScore {
  return buildCentreChecklist({
    province: centre.province,
    licenceOnFile: Boolean((centre.license_photo || "").trim()),
    screeningOnFile: centre.screening_on_file === 1 || centre.screening_on_file === true,
    documents,
  });
}

async function assertCentreManager(sql: Sql, userId: string, daycareId: string) {
  const { assertCanWrite } = await import("@/lib/server/centre-access");
  await assertCanWrite(sql, userId, daycareId, "document_upload");
}

export const listCentreDocumentChecklist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => String(daycareId || "").trim())
  .handler(async ({ context, data: daycareId }) => {
    if (!centreDocumentsEnabled()) return { enabled: false as const, checklist: null };
    const sql = await getSql();
    const access = await listAccessibleDaycareIds(sql, context.userId);
    const admin = (await resolveAdminAccess(context.userId)).ok;
    if (!admin && !access.includes(daycareId)) throw new Error("You can only open documents for your centre.");
    const centre = await centreFacts(sql, daycareId);
    if (!centre) throw new Error("Centre not found");
    const documents = await rowsFor(sql, daycareId);
    return { enabled: true as const, checklist: scoreFor(centre, documents), centreName: centre.name };
  });

export const saveCentreDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      kind: "insurance" | "policy" | "handbook";
      policyKey?: string | null;
      dataUrl: string;
      mime: string;
      filename?: string;
      expiresOn?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (!centreDocumentsEnabled()) throw new Error("Documents are off.");
    if (data.kind !== "insurance" && data.kind !== "policy" && data.kind !== "handbook") {
      throw new Error("That document type is not saved here.");
    }
    const policyKey: PolicyKey | null = data.kind === "policy" ? (isPolicyKey(data.policyKey) ? data.policyKey : null) : null;
    if (data.kind === "policy" && !policyKey) throw new Error("Choose which policy this file is.");
    if (data.kind === "insurance" && !/^\d{4}-\d{2}-\d{2}$/.test(data.expiresOn || "")) {
      throw new Error("Add the insurance expiry date.");
    }
    const parsed = parsePrivateUpload({ dataUrl: data.dataUrl, mime: data.mime, filename: data.filename });
    if (!parsed.ok) throw new Error(parsed.error);
    const sql = await getSql();
    await assertCentreManager(sql, context.userId, data.daycareId);
    const stored = await persistPrivateDoc({
      prefix: R2_CENTRE_DOC_PREFIX,
      keyTail: `${data.daycareId}/${nid("cdc")}`,
      body: parsed.body,
      mime: parsed.mime,
    });
    const id = nid("cdc");
    if (data.kind === "policy") {
      await sql`delete from centre_documents where daycare_id = ${data.daycareId} and kind = 'policy' and policy_key = ${policyKey}`;
    } else {
      await sql`delete from centre_documents where daycare_id = ${data.daycareId} and kind = ${data.kind}`;
    }
    await sql`
      insert into centre_documents (
        id, daycare_id, kind, policy_key, filename, mime, storage_ref, expires_on, review_status, updated_at
      ) values (
        ${id},
        ${data.daycareId},
        ${data.kind},
        ${policyKey},
        ${parsed.filename},
        ${stored.mime},
        ${stored.storageRef},
        ${data.expiresOn || null},
        'pending',
        now()
      )
    `;
    const saved = await sql<{ id: string }>`
      select id from centre_documents where id = ${id} and daycare_id = ${data.daycareId} limit 1
    `;
    if (!saved[0]) throw new Error("The file was not saved. Try again.");
    const centre = await centreFacts(sql, data.daycareId);
    if (!centre) throw new Error("Centre not found");
    const documents = await rowsFor(sql, data.daycareId);
    return { ok: true as const, id, checklist: scoreFor(centre, documents) };
  });

export const deleteCentreDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; documentId: string }) => input)
  .handler(async ({ context, data }) => {
    if (!centreDocumentsEnabled()) throw new Error("Documents are off.");
    const sql = await getSql();
    await assertCentreManager(sql, context.userId, data.daycareId);
    const removed = await sql<{ id: string }>`
      delete from centre_documents
      where id = ${data.documentId} and daycare_id = ${data.daycareId}
      returning id
    `;
    if (!removed[0]) throw new Error("File not found");
    const centre = await centreFacts(sql, data.daycareId);
    if (!centre) throw new Error("Centre not found");
    const documents = await rowsFor(sql, data.daycareId);
    return { ok: true as const, checklist: scoreFor(centre, documents) };
  });

export type AdminDocumentCentre = {
  daycareId: string;
  name: string;
  city: string;
  province: string;
  percent: number;
  missing: number;
  expiring: number;
  expired: number;
  pending: number;
  checklist: ChecklistScore;
};

export const listAdminCentreDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    if (!centreDocumentsEnabled()) return { enabled: false as const, centres: [] as AdminDocumentCentre[] };
    const sql = await getSql();
    const centres = await sql<{
      id: string;
      name: string;
      city: string | null;
      province: string | null;
      license_photo: string | null;
      claim_status: string | null;
      screening_on_file: number | boolean | null;
    }>`
      select id, name, city, province, license_photo, claim_status, screening_on_file
      from daycares
      where claimed_at is not null
        and coalesce(claim_status, '') not in ('superseded', 'unclaimed')
      order by name
      limit 200
    `.catch(() => []);
    const docs = await sql<DocRow>`
      select id, daycare_id, kind, policy_key, filename, mime, storage_ref, expires_on, review_status, review_reason
      from centre_documents
    `.catch(() => [] as DocRow[]);
    const byCentre = new Map<string, StoredCentreDoc[]>();
    for (const row of docs) {
      const stored = toStored(row);
      if (!stored) continue;
      const list = byCentre.get(row.daycare_id) || [];
      list.push(stored);
      byCentre.set(row.daycare_id, list);
    }
    return {
      enabled: true as const,
      centres: centres.map((centre) => {
        const checklist = scoreFor(centre, byCentre.get(centre.id) || []);
        return {
          daycareId: centre.id,
          name: centre.name,
          city: centre.city || "",
          province: centre.province || "",
          percent: checklist.percent,
          missing: checklist.missing,
          expiring: checklist.expiring,
          expired: checklist.expired,
          pending: checklist.items.filter((item) => item.reviewStatus === "pending" && item.documentId).length,
          checklist,
        };
      }),
    };
  });

export const reviewCentreDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { documentId: string; decision: "approved" | "rejected"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!centreDocumentsEnabled()) throw new Error("Documents are off.");
    if (data.decision !== "approved" && data.decision !== "rejected") throw new Error("Choose approve or reject.");
    const reason = (data.reason || "").trim().slice(0, 500);
    if (data.decision === "rejected" && reason.length < 3) throw new Error("Add a short reason.");
    const sql = await getSql();
    const updated = await sql<{ id: string }>`
      update centre_documents
      set review_status = ${data.decision},
          review_reason = ${reason || null},
          reviewed_by = ${context.userId},
          reviewed_at = now(),
          updated_at = now()
      where id = ${data.documentId}
      returning id
    `;
    if (!updated[0]) throw new Error("File not found");
    return { ok: true as const, status: data.decision };
  });

export async function publicDocumentsVerified(sql: Sql, daycareId: string): Promise<boolean> {
  if (!centreDocumentsEnabled()) return false;
  const centre = await sql<{ claim_status: string | null }>`
    select claim_status from daycares where id = ${daycareId} limit 1
  `.catch(() => [] as { claim_status: string | null }[]);
  const approved = ["approved", "live", "active", "published"].includes((centre[0]?.claim_status || "").trim());
  const documents = await rowsFor(sql, daycareId);
  const insurance = documents.find((row) => row.kind === "insurance") || null;
  return documentsVerifiedBadge({ licenceApproved: approved, insurance });
}

export async function authorizeCentreDocument(input: { userId: string; documentId: string }) {
  const sql = await getSql();
  const rows = await sql<DocRow>`
    select id, daycare_id, kind, policy_key, filename, mime, storage_ref, expires_on, review_status, review_reason
    from centre_documents where id = ${input.documentId} limit 1
  `;
  const row = rows[0];
  if (!row?.storage_ref) throw new Error("File not found");
  const admin = (await resolveAdminAccess(input.userId)).ok;
  if (!admin) {
    const access = await listAccessibleDaycareIds(sql, input.userId);
    if (!access.includes(row.daycare_id)) throw new Error("You can only open documents for your centre.");
  }
  return row;
}
