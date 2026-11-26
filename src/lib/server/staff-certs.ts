/**
 * ECE certificates per staff member: owner view, staff self-view, file upload
 * and download. Reuses ece_certificates and wiring_notices. No new table.
 * Nothing is emailed from here; expiry reminders are in-app bell items.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { R2_CENTRE_DOC_PREFIX } from "@/lib/private-docs";
import {
  ECE_CERT_LINK_FEATURE,
  certStatus,
  cleanCertInput,
  parseCertLink,
  type CertLink,
} from "@/lib/staff-certs";
import { randomBytes } from "node:crypto";

type Sql = Awaited<ReturnType<typeof getSql>>;

type CertRow = {
  id: string;
  daycare_id: string;
  staff_name: string;
  certificate_number: string;
  level: string;
  expires_on: string;
};

export async function readCertLinks(sql: Sql, certIds: string[]): Promise<Map<string, CertLink>> {
  const map = new Map<string, CertLink>();
  if (!certIds.length) return map;
  const rows = await sql
    .query<{ mode: string; body: string }>(
      `select mode, body from wiring_notices
        where feature = $1 and mode = any($2::text[])
        order by created_at asc`,
      [ECE_CERT_LINK_FEATURE, certIds],
    )
    .catch(() => [] as Array<{ mode: string; body: string }>);
  for (const row of rows) {
    const link = parseCertLink(row.body);
    if (link && link.certId === row.mode) map.set(row.mode, link);
  }
  return map;
}

async function writeCertLink(sql: Sql, link: CertLink) {
  await sql`delete from wiring_notices where feature = ${ECE_CERT_LINK_FEATURE} and mode = ${link.certId}`;
  await sql`
    insert into wiring_notices (id, feature, user_id, channel, mode, body)
    values (${`ecl_${randomBytes(9).toString("hex")}`}, ${ECE_CERT_LINK_FEATURE}, ${link.staffUserId || ""}, ${"cert"}, ${link.certId}, ${JSON.stringify(link)})
  `;
}

/** Owners, managers and admins with the schedule area. */
async function centresICanManage(
  sql: Sql,
  userId: string,
  need: "view" | "edit",
): Promise<string[]> {
  const { daycareIdsForArea } = await import("@/lib/server/centre-access");
  return daycareIdsForArea(sql, userId, "schedule", need).catch(() => [] as string[]);
}

async function canWriteCentre(sql: Sql, userId: string, daycareId: string): Promise<boolean> {
  const ids = await centresICanManage(sql, userId, "edit");
  if (!ids.includes(daycareId)) return false;
  const { loadCentreRole } = await import("@/lib/server/centre-access");
  const role = await loadCentreRole(sql, userId, daycareId).catch(() => null);
  return centreCanWriteCare(role);
}

async function myMemberCentres(sql: Sql, userId: string) {
  return sql
    .query<{ id: string; name: string; province: string }>(
      `select d.id, d.name, d.province
         from centre_members m join daycares d on d.id = m.daycare_id
        where m.user_id = $1 and m.status = 'active'
        union
       select d.id, d.name, d.province
         from provider_daycares p join daycares d on d.id = p.daycare_id
        where p.user_id = $1
        order by 2`,
      [userId],
    )
    .catch(() => [] as Array<{ id: string; name: string; province: string }>);
}

function shapeCert(row: CertRow, link: CertLink | undefined, now: Date) {
  const expiresOn = String(row.expires_on).slice(0, 10);
  return {
    id: row.id,
    daycareId: row.daycare_id,
    staffName: row.staff_name,
    level: row.level,
    certificateNumber: row.certificate_number,
    expiresOn,
    status: certStatus(expiresOn, now),
    staffUserId: link?.staffUserId ?? null,
    hasFile: Boolean(link?.fileRef),
    fileName: link?.fileName ?? null,
  };
}

export const listCentreEceCerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const ids = await centresICanManage(sql, context.userId, "view");
    if (!ids.length) return { centres: [], daycareId: "", certs: [], members: [], canWrite: false };
    const centres = await sql
      .query<{ id: string; name: string }>(
        `select id, name from daycares where id = any($1::text[]) order by name`,
        [ids],
      )
      .catch(() => [] as Array<{ id: string; name: string }>);
    const daycareId = centres.some((c) => c.id === data.daycareId)
      ? data.daycareId
      : centres[0]?.id || "";
    if (!daycareId) return { centres, daycareId: "", certs: [], members: [], canWrite: false };
    const rows = await sql<CertRow>`
      select id, daycare_id, staff_name, certificate_number, level, expires_on::text as expires_on
        from ece_certificates where daycare_id = ${daycareId}
       order by expires_on asc limit 200
    `.catch(() => [] as CertRow[]);
    const links = await readCertLinks(
      sql,
      rows.map((r) => r.id),
    );
    const members = await sql
      .query<{ user_id: string; name: string | null; role: string }>(
        `select m.user_id, coalesce(nullif(btrim(u.name), ''), u.email) as name, m.role
           from centre_members m left join "user" u on u.id = m.user_id
          where m.daycare_id = $1 and m.status = 'active' and m.role in ('staff', 'manager', 'owner')
          order by 2`,
        [daycareId],
      )
      .catch(() => [] as Array<{ user_id: string; name: string | null; role: string }>);
    const now = new Date();
    return {
      centres,
      daycareId,
      certs: rows.map((row) => shapeCert(row, links.get(row.id), now)),
      members: members.map((m) => ({ userId: m.user_id, name: m.name || "", role: m.role })),
      canWrite: await canWriteCentre(sql, context.userId, daycareId),
    };
  });

async function storeCertFile(
  certId: string,
  daycareId: string,
  file: { dataUrl?: string; filename?: string } | undefined,
) {
  if (!file?.dataUrl) return null;
  const { parsePrivateUpload, persistPrivateDoc } = await import("@/lib/server/private-docs");
  const parsed = parsePrivateUpload({ dataUrl: file.dataUrl, filename: file.filename });
  if (!parsed.ok) throw new Error(parsed.error);
  const safeCentre = daycareId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  const stored = await persistPrivateDoc({
    prefix: R2_CENTRE_DOC_PREFIX,
    keyTail: `ece-certs/${safeCentre}/${certId}-${Date.now().toString(36)}`,
    body: parsed.body,
    mime: parsed.mime,
  });
  return { fileRef: stored.storageRef, fileMime: stored.mime, fileName: parsed.filename };
}

type SaveInput = {
  daycareId?: string;
  staffUserId?: string;
  staffName?: string;
  level?: string;
  certificateNumber?: string;
  expiresOn?: string;
  file?: { dataUrl?: string; filename?: string };
};

async function insertCert(
  sql: Sql,
  input: {
    daycareId: string;
    staffName: string;
    staffUserId: string | null;
    level: string;
    certificateNumber: string;
    expiresOn: string;
    createdBy: string;
    file?: { dataUrl?: string; filename?: string };
  },
) {
  const provinceRows = await sql<{
    province: string;
  }>`select province from daycares where id = ${input.daycareId} limit 1`;
  const province = (provinceRows[0]?.province || "").slice(0, 8);
  const id = `ece_${randomBytes(9).toString("hex")}`;
  const stored = await storeCertFile(id, input.daycareId, input.file);
  await sql`
    insert into ece_certificates (
      id, daycare_id, staff_name, province, certificate_number, level, expires_on, created_by
    ) values (
      ${id}, ${input.daycareId}, ${input.staffName}, ${province},
      ${input.certificateNumber}, ${input.level}, ${input.expiresOn}, ${input.createdBy}
    )
  `;
  await writeCertLink(sql, {
    certId: id,
    daycareId: input.daycareId,
    staffUserId: input.staffUserId,
    fileRef: stored?.fileRef ?? null,
    fileMime: stored?.fileMime ?? null,
    fileName: stored?.fileName ?? null,
  });
  return id;
}

export const saveCentreEceCert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SaveInput) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const daycareId = String(data.daycareId || "").trim();
    if (!(await canWriteCentre(sql, context.userId, daycareId))) {
      throw new Error("You can view this centre. You cannot change it.");
    }
    const clean = cleanCertInput(data);
    if (!clean.ok) throw new Error("Check the expiry date.");
    let staffUserId = String(data.staffUserId || "").trim() || null;
    let staffName = String(data.staffName || "")
      .trim()
      .slice(0, 80);
    if (staffUserId) {
      const member = await sql<{ name: string | null }>`
        select coalesce(nullif(btrim(u.name), ''), u.email) as name
          from centre_members m left join "user" u on u.id = m.user_id
         where m.daycare_id = ${daycareId} and m.user_id = ${staffUserId} and m.status = 'active'
         limit 1
      `;
      if (!member.length) throw new Error("That person is not on this centre's team.");
      if (!staffName) staffName = String(member[0].name || "").slice(0, 80);
    } else {
      staffUserId = null;
    }
    if (staffName.length < 2) throw new Error("Pick a staff member or type a name.");
    const id = await insertCert(sql, {
      ...clean,
      daycareId,
      staffName,
      staffUserId,
      createdBy: context.userId,
      file: data.file,
    });
    return { ok: true as const, id };
  });

export const listMyEceCerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const centres = await myMemberCentres(sql, context.userId);
    const linkRows = await sql
      .query<{ mode: string }>(
        `select mode from wiring_notices where feature = $1 and user_id = $2`,
        [ECE_CERT_LINK_FEATURE, context.userId],
      )
      .catch(() => [] as Array<{ mode: string }>);
    const certIds = linkRows.map((r) => r.mode);
    const rows = certIds.length
      ? await sql
          .query<CertRow & { centre: string }>(
            `select c.id, c.daycare_id, c.staff_name, c.certificate_number, c.level,
                    c.expires_on::text as expires_on, d.name as centre
               from ece_certificates c join daycares d on d.id = c.daycare_id
              where c.id = any($1::text[])
              order by c.expires_on asc`,
            [certIds],
          )
          .catch(() => [] as Array<CertRow & { centre: string }>)
      : [];
    const links = await readCertLinks(
      sql,
      rows.map((r) => r.id),
    );
    const now = new Date();
    return {
      centres: centres.map((c) => ({ id: c.id, name: c.name })),
      certs: rows
        .filter((row) => links.get(row.id)?.staffUserId === context.userId)
        .map((row) => ({ ...shapeCert(row, links.get(row.id), now), centre: row.centre })),
    };
  });

export const saveMyEceCert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SaveInput) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const daycareId = String(data.daycareId || "").trim();
    const centres = await myMemberCentres(sql, context.userId);
    if (!centres.some((c) => c.id === daycareId)) throw new Error("Join this centre's team first.");
    const clean = cleanCertInput(data);
    if (!clean.ok) throw new Error("Check the expiry date.");
    const me = await sql<{ name: string | null }>`
      select coalesce(nullif(btrim(name), ''), email) as name from "user" where id = ${context.userId} limit 1
    `.catch(() => [] as Array<{ name: string | null }>);
    const staffName = String(data.staffName || me[0]?.name || "")
      .trim()
      .slice(0, 80);
    if (staffName.length < 2) throw new Error("Add your name.");
    const id = await insertCert(sql, {
      ...clean,
      daycareId,
      staffName,
      staffUserId: context.userId,
      createdBy: context.userId,
      file: data.file,
    });
    return { ok: true as const, id };
  });

async function certAccess(sql: Sql, userId: string, certId: string, need: "view" | "edit") {
  const rows = await sql<{ id: string; daycare_id: string }>`
    select id, daycare_id from ece_certificates where id = ${certId} limit 1
  `;
  const cert = rows[0];
  if (!cert) throw new Error("Certificate not found.");
  const link = (await readCertLinks(sql, [cert.id])).get(cert.id) ?? {
    certId: cert.id,
    daycareId: cert.daycare_id,
    staffUserId: null,
    fileRef: null,
    fileMime: null,
    fileName: null,
  };
  const self = link.staffUserId === userId;
  const centre =
    need === "edit"
      ? await canWriteCentre(sql, userId, cert.daycare_id)
      : (await centresICanManage(sql, userId, "view")).includes(cert.daycare_id);
  if (!self && !centre) throw new Error("You cannot open this certificate.");
  return { cert, link };
}

export const uploadEceCertFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { certId?: string; dataUrl?: string; filename?: string }) => ({
    certId: String(input?.certId || "").trim(),
    dataUrl: String(input?.dataUrl || ""),
    filename: String(input?.filename || "").slice(0, 160),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { cert, link } = await certAccess(sql, context.userId, data.certId, "edit");
    const stored = await storeCertFile(cert.id, cert.daycare_id, data);
    if (!stored) throw new Error("Upload a PDF or image under 4 MB.");
    await writeCertLink(sql, { ...link, ...stored });
    return { ok: true as const };
  });

export const downloadEceCertFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { certId?: string }) => ({ certId: String(input?.certId || "").trim() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { link } = await certAccess(sql, context.userId, data.certId, "view");
    if (!link.fileRef) throw new Error("No file yet.");
    const { loadPrivateDoc } = await import("@/lib/server/private-docs");
    const doc = await loadPrivateDoc(link.fileRef, link.fileMime, link.fileName);
    return {
      filename: doc.filename,
      dataUrl: `data:${doc.mime};base64,${Buffer.from(doc.body).toString("base64")}`,
    };
  });
