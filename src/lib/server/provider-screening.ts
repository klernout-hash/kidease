import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  SCREENING_FORBIDDEN,
  SCREENING_PERSON_NAME,
  centreCanManageScreening,
  centreCanViewScreening,
  centreEarnsScreeningOnFile,
  decideAdminScreeningReview,
  decideScreeningAccess,
  deskRoleToScreeningRole,
  effectiveDocStatus,
  isHomeBasedForScreening,
  isScreeningDocKind,
  isScreeningRole,
  parseScreeningUpload,
  requirementsFor,
  screeningLetterHtml,
  type ScreeningDocKind,
  type ScreeningDocStatus,
  type ScreeningRole,
} from "@/lib/provider-screening";
import type { CentreMemberRole } from "@/lib/centre-roles";
import { loadCentreRole } from "@/lib/server/centre-access";
import { requireAdmin, resolveAdminAccess } from "@/lib/server/roles";
import { writeTrustEvent } from "@/lib/server/trust";
import { nid } from "@/lib/utils";

export type ScreeningDocView = {
  id: string | null;
  kind: ScreeningDocKind;
  status: ScreeningDocStatus;
  issuedOn: string | null;
  expiresOn: string | null;
  hasFile: boolean;
  filename: string | null;
  reviewerNotes: string | null;
  notes: string;
};

export type ScreeningPersonView = {
  id: string;
  name: string;
  role: ScreeningRole;
  mine: boolean;
  linkedMember: boolean;
  docs: ScreeningDocView[];
};

export type ScreeningCentreView = {
  daycareId: string;
  daycareName: string;
  province: string;
  facilityType: string | null;
  packStatus: "seeded" | "stub";
  screeningOnFile: boolean;
  canManage: boolean;
  people: ScreeningPersonView[];
};

export type ScreeningDeskPayload = {
  centres: ScreeningCentreView[];
  canManage: boolean;
};

export type AdminScreeningQueueRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  city: string;
  province: string;
  slug: string;
  personName: string;
  role: ScreeningRole;
  kind: ScreeningDocKind;
  status: ScreeningDocStatus;
  filename: string | null;
  uploadedAt: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
};

type PersonRow = {
  id: string;
  daycare_id: string;
  member_id: string | null;
  user_id: string | null;
  screening_role: string;
  display_name: string;
  archived_at: string | null;
};

type DocRow = {
  id: string;
  daycare_id: string;
  person_id: string;
  doc_kind: string;
  status: string;
  issued_on: string | null;
  expires_on: string | null;
  storage_ref: string | null;
  storage_mime: string | null;
  original_filename: string | null;
  reviewer_notes: string | null;
};

async function syncScreeningPeople(sql: Sql, daycareId: string) {
  const members = await sql<{
    id: string;
    user_id: string;
    role: string;
    email: string | null;
    name: string | null;
  }>`
    select m.id, m.user_id, m.role, u.email, u.name
    from centre_members m
    left join "user" u on u.id = m.user_id
    where m.daycare_id = ${daycareId} and m.status = 'active'
  `.catch(() => []);

  for (const member of members) {
    const role = deskRoleToScreeningRole(member.role);
    const display =
      (member.name || "").trim() ||
      (member.email || "").trim() ||
      "Team member";
    const existing = await sql<{ id: string }>`
      select id from provider_screening_people
      where daycare_id = ${daycareId} and member_id = ${member.id}
      limit 1
    `.catch(() => []);
    if (existing[0]) {
      await sql`
        update provider_screening_people
        set screening_role = ${role},
            display_name = ${display.slice(0, 120)},
            user_id = ${member.user_id},
            archived_at = null
        where id = ${existing[0].id}
      `.catch(() => undefined);
    } else {
      await sql`
        insert into provider_screening_people
          (id, daycare_id, member_id, user_id, screening_role, display_name)
        values (
          ${nid("sp")},
          ${daycareId},
          ${member.id},
          ${member.user_id},
          ${role},
          ${display.slice(0, 120)}
        )
      `.catch(() => undefined);
    }
  }

  const activeIds = members.map((m) => m.id);
  if (activeIds.length) {
    await sql.query(
      `update provider_screening_people
       set archived_at = now()
       where daycare_id = $1
         and member_id is not null
         and archived_at is null
         and not (member_id = any($2::text[]))`,
      [daycareId, activeIds],
    ).catch(() => undefined);
  } else {
    await sql`
      update provider_screening_people
      set archived_at = now()
      where daycare_id = ${daycareId}
        and member_id is not null
        and archived_at is null
    `.catch(() => undefined);
  }
}

async function refreshScreeningOnFile(sql: Sql, daycareId: string, actorUserId: string | null) {
  const centre = await sql<{
    province: string;
    facility_type: string | null;
    screening_on_file: number | boolean | null;
  }>`
    select province, facility_type, screening_on_file
    from daycares where id = ${daycareId} limit 1
  `.catch(() => []);
  const row = centre[0];
  if (!row) return false;
  const people = await sql<PersonRow>`
    select id, daycare_id, member_id, user_id, screening_role, display_name, archived_at
    from provider_screening_people where daycare_id = ${daycareId}
  `.catch(() => []);
  const docs = await sql<DocRow>`
    select id, daycare_id, person_id, doc_kind, status, issued_on::text as issued_on,
           expires_on::text as expires_on, storage_ref, storage_mime, original_filename, reviewer_notes
    from provider_screening_documents where daycare_id = ${daycareId}
  `.catch(() => []);
  const earned = centreEarnsScreeningOnFile({
    province: row.province,
    facilityType: row.facility_type,
    people: people.map((p) => ({
      id: p.id,
      screeningRole: (p.screening_role as ScreeningRole) || "staff",
      archivedAt: p.archived_at,
    })),
    documents: docs.map((d) => ({
      personId: d.person_id,
      docKind: d.doc_kind as ScreeningDocKind,
      status: d.status as ScreeningDocStatus,
      expiresOn: d.expires_on,
    })),
  });
  const current = row.screening_on_file === 1 || row.screening_on_file === true;
  if (earned === current) return earned;
  await sql`
    update daycares
    set screening_on_file = ${earned ? 1 : 0},
        screening_on_file_at = ${earned ? new Date().toISOString() : null},
        screening_on_file_by = ${earned ? actorUserId : null}
    where id = ${daycareId}
  `.catch(() => undefined);
  await writeTrustEvent(sql, {
    daycareId,
    actorUserId,
    kind: earned ? "screening_on_file" : "screening_on_file_cleared",
    note: earned
      ? "Admin cleared every required current screening document. Public badge is centre-level only."
      : "Required screening documents are no longer all current and cleared.",
  });
  return earned;
}

async function upsertDocument(
  sql: Sql,
  input: {
    daycareId: string;
    personId: string;
    kind: ScreeningDocKind;
    patch: Record<string, unknown>;
  },
) {
  const existing = await sql<{ id: string }>`
    select id from provider_screening_documents
    where person_id = ${input.personId} and doc_kind = ${input.kind}
    limit 1
  `.catch(() => []);
  const id = existing[0]?.id || nid("sd");
  if (!existing[0]) {
    await sql`
      insert into provider_screening_documents (id, daycare_id, person_id, doc_kind, status)
      values (${id}, ${input.daycareId}, ${input.personId}, ${input.kind}, ${"missing"})
    `;
  }
  const issuedOn = (input.patch.issuedOn as string | null | undefined) ?? undefined;
  const expiresOn = (input.patch.expiresOn as string | null | undefined) ?? undefined;
  const status = (input.patch.status as string | undefined) ?? undefined;
  const storageRef = (input.patch.storageRef as string | null | undefined) ?? undefined;
  const storageMime = (input.patch.storageMime as string | null | undefined) ?? undefined;
  const filename = (input.patch.filename as string | null | undefined) ?? undefined;
  const reviewerNotes = (input.patch.reviewerNotes as string | null | undefined) ?? undefined;
  const reviewedBy = (input.patch.reviewedBy as string | null | undefined) ?? undefined;
  const reviewedAt = (input.patch.reviewedAt as string | null | undefined) ?? undefined;
  const letterAt = (input.patch.letterGeneratedAt as string | null | undefined) ?? undefined;
  const uploadedBy = (input.patch.uploadedBy as string | null | undefined) ?? undefined;
  const uploadedAt = (input.patch.uploadedAt as string | null | undefined) ?? undefined;
  await sql`
    update provider_screening_documents
    set status = coalesce(${status ?? null}, status),
        issued_on = coalesce(${issuedOn ?? null}, issued_on),
        expires_on = coalesce(${expiresOn ?? null}, expires_on),
        storage_ref = coalesce(${storageRef ?? null}, storage_ref),
        storage_mime = coalesce(${storageMime ?? null}, storage_mime),
        original_filename = coalesce(${filename ?? null}, original_filename),
        reviewer_notes = coalesce(${reviewerNotes ?? null}, reviewer_notes),
        reviewed_by = coalesce(${reviewedBy ?? null}, reviewed_by),
        reviewed_at = coalesce(${reviewedAt ?? null}, reviewed_at),
        letter_generated_at = coalesce(${letterAt ?? null}, letter_generated_at),
        uploaded_by = coalesce(${uploadedBy ?? null}, uploaded_by),
        uploaded_at = coalesce(${uploadedAt ?? null}, uploaded_at),
        updated_at = now()
    where id = ${id}
  `;
  return id;
}

function buildPersonView(input: {
  person: PersonRow;
  docs: DocRow[];
  province: string;
  homeBased: boolean;
  actorUserId: string;
}): ScreeningPersonView {
  const role = (input.person.screening_role as ScreeningRole) || "staff";
  const reqs = requirementsFor(input.province, role, input.homeBased);
  const docs = reqs.map((req): ScreeningDocView => {
    const row = input.docs.find((d) => d.doc_kind === req.docKind);
    const status = row
      ? effectiveDocStatus({
          status: row.status as ScreeningDocStatus,
          expiresOn: row.expires_on,
        })
      : "missing";
    return {
      id: row?.id ?? null,
      kind: req.docKind,
      status,
      issuedOn: row?.issued_on ?? null,
      expiresOn: row?.expires_on ?? null,
      hasFile: Boolean(row?.storage_ref),
      filename: row?.original_filename ?? null,
      reviewerNotes: row?.reviewer_notes ?? null,
      notes: req.notes,
    };
  });
  return {
    id: input.person.id,
    name: input.person.display_name,
    role,
    mine: Boolean(input.person.user_id && input.person.user_id === input.actorUserId),
    linkedMember: Boolean(input.person.member_id),
    docs,
  };
}

async function loadCentreScreening(
  sql: Sql,
  daycareId: string,
  actorUserId: string,
  actorRole: CentreMemberRole | null,
): Promise<ScreeningCentreView | null> {
  const centre = await sql<{
    id: string;
    name: string;
    province: string;
    facility_type: string | null;
    screening_on_file: number | boolean | null;
  }>`
    select id, name, province, facility_type, screening_on_file
    from daycares where id = ${daycareId} limit 1
  `.catch(() => []);
  const row = centre[0];
  if (!row) return null;
  await syncScreeningPeople(sql, daycareId);
  const people = await sql<PersonRow>`
    select id, daycare_id, member_id, user_id, screening_role, display_name, archived_at
    from provider_screening_people
    where daycare_id = ${daycareId} and archived_at is null
    order by screening_role, display_name
  `.catch(() => []);
  const docs = await sql<DocRow>`
    select id, daycare_id, person_id, doc_kind, status, issued_on::text as issued_on,
           expires_on::text as expires_on, storage_ref, storage_mime, original_filename, reviewer_notes
    from provider_screening_documents where daycare_id = ${daycareId}
  `.catch(() => []);
  const home = isHomeBasedForScreening(row.facility_type);
  const manage = centreCanManageScreening(actorRole);
  let views = people.map((person) =>
    buildPersonView({
      person,
      docs: docs.filter((d) => d.person_id === person.id),
      province: row.province,
      homeBased: home,
      actorUserId,
    }),
  );
  if (!manage) {
    views = views.filter((p) => p.mine);
  }
  const packStatus = row.province.trim().toUpperCase() === "MB" ? "seeded" : "stub";
  return {
    daycareId: row.id,
    daycareName: row.name,
    province: row.province,
    facilityType: row.facility_type,
    packStatus,
    screeningOnFile: row.screening_on_file === 1 || row.screening_on_file === true,
    canManage: manage,
    people: views,
  };
}

export const listProviderScreening = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ScreeningDeskPayload> => {
    const sql = await getSql();
    const centres = await sql<{ id: string; name: string }>`
      select d.id, d.name
      from daycares d
      where exists (
        select 1 from provider_daycares p
        where p.daycare_id = d.id and p.user_id = ${context.userId}
      ) or exists (
        select 1 from centre_members m
        where m.daycare_id = d.id and m.user_id = ${context.userId} and m.status = 'active'
      )
      order by d.name
    `.catch(() => []);
    const views: ScreeningCentreView[] = [];
    let canManage = false;
    for (const centre of centres) {
      const role = await loadCentreRole(sql, context.userId, centre.id);
      if (!centreCanViewScreening(role)) continue;
      if (centreCanManageScreening(role)) canManage = true;
      const view = await loadCentreScreening(sql, centre.id, context.userId, role);
      if (view) views.push(view);
    }
    return { centres: views, canManage };
  });

export const addScreeningPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; name: string; role: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const daycareId = data.daycareId.trim();
    const role = await loadCentreRole(sql, context.userId, daycareId);
    const gate = decideScreeningAccess({
      actorRole: role,
      actorUserId: context.userId,
      action: "add_person",
    });
    if (!gate.ok) throw new Error(gate.error);
    const name = data.name.trim().slice(0, 120);
    if (name.length < 2) throw new Error(SCREENING_PERSON_NAME);
    if (!isScreeningRole(data.role) || data.role === "owner" || data.role === "director") {
      throw new Error("Add a volunteer or household resident.");
    }
    const id = nid("sp");
    await sql`
      insert into provider_screening_people
        (id, daycare_id, screening_role, display_name, created_by)
      values (${id}, ${daycareId}, ${data.role}, ${name}, ${context.userId})
    `;
    await writeTrustEvent(sql, {
      daycareId,
      actorUserId: context.userId,
      kind: "screening_person_added",
      note: `Added ${data.role} for private screening checklist.`,
    });
    return { ok: true as const, id };
  });

export const generateScreeningLetter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; personId: string; kind: string; locale?: "en" | "fr" }) => input)
  .handler(async ({ context, data }) => {
    if (!isScreeningDocKind(data.kind) || data.kind !== "vsc") {
      throw new Error("Letters are only for Vulnerable Sector Check requests.");
    }
    const sql = await getSql();
    const role = await loadCentreRole(sql, context.userId, data.daycareId);
    const person = await sql<PersonRow>`
      select id, daycare_id, member_id, user_id, screening_role, display_name, archived_at
      from provider_screening_people
      where id = ${data.personId} and daycare_id = ${data.daycareId}
      limit 1
    `.catch(() => []);
    const row = person[0];
    if (!row || row.archived_at) throw new Error(SCREENING_FORBIDDEN);
    const gate = decideScreeningAccess({
      actorRole: role,
      actorUserId: context.userId,
      targetUserId: row.user_id,
      action: centreCanManageScreening(role) ? "manage" : "act_own",
    });
    if (!gate.ok) throw new Error(gate.error);
    const centre = await sql<{ name: string; province: string }>`
      select name, province from daycares where id = ${data.daycareId} limit 1
    `;
    if (!centre[0]) throw new Error("Centre not found");
    const generatedOn = new Date().toISOString().slice(0, 10);
    await upsertDocument(sql, {
      daycareId: data.daycareId,
      personId: row.id,
      kind: "vsc",
      patch: { status: "letter_ready", letterGeneratedAt: new Date().toISOString() },
    });
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: "screening_letter",
      note: "VSC request letter generated. KidEase did not issue a police check.",
    });
    return {
      ok: true as const,
      html: screeningLetterHtml({
        locale: data.locale === "fr" ? "fr" : "en",
        centreName: centre[0].name,
        personName: row.display_name,
        role: (row.screening_role as ScreeningRole) || "staff",
        province: centre[0].province,
        generatedOn,
      }),
    };
  });

export const uploadScreeningDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      personId: string;
      kind: string;
      dataUrl: string;
      mime: string;
      filename?: string;
      issuedOn?: string;
      expiresOn?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (!isScreeningDocKind(data.kind)) throw new Error(SCREENING_FORBIDDEN);
    const file = parseScreeningUpload({
      dataUrl: data.dataUrl,
      mime: data.mime,
      filename: data.filename,
    });
    if (!file.ok) throw new Error(file.error);
    const sql = await getSql();
    const role = await loadCentreRole(sql, context.userId, data.daycareId);
    const person = await sql<PersonRow>`
      select id, daycare_id, member_id, user_id, screening_role, display_name, archived_at
      from provider_screening_people
      where id = ${data.personId} and daycare_id = ${data.daycareId}
      limit 1
    `.catch(() => []);
    const row = person[0];
    if (!row || row.archived_at) throw new Error(SCREENING_FORBIDDEN);
    const gate = decideScreeningAccess({
      actorRole: role,
      actorUserId: context.userId,
      targetUserId: row.user_id,
      action: centreCanManageScreening(role) ? "manage" : "act_own",
    });
    if (!gate.ok) throw new Error(gate.error);
    const issuedOn = (data.issuedOn || "").trim().slice(0, 10) || null;
    const expiresOn = (data.expiresOn || "").trim().slice(0, 10) || null;
    await upsertDocument(sql, {
      daycareId: data.daycareId,
      personId: row.id,
      kind: data.kind,
      patch: {
        status: "admin_review",
        storageRef: file.dataUrl,
        storageMime: file.mime,
        filename: file.filename,
        issuedOn,
        expiresOn,
        uploadedBy: context.userId,
        uploadedAt: new Date().toISOString(),
        reviewerNotes: null,
      },
    });
    await writeTrustEvent(sql, {
      daycareId: data.daycareId,
      actorUserId: context.userId,
      kind: "screening_upload",
      note: `${data.kind} uploaded for Admin review. File stays private.`,
    });
    return { ok: true as const };
  });

export const getScreeningDocumentFile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { documentId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      person_id: string;
      storage_ref: string | null;
      storage_mime: string | null;
      original_filename: string | null;
      user_id: string | null;
    }>`
      select d.id, d.daycare_id, d.person_id, d.storage_ref, d.storage_mime, d.original_filename, p.user_id
      from provider_screening_documents d
      join provider_screening_people p on p.id = d.person_id
      where d.id = ${data.documentId}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row?.storage_ref) throw new Error("File not found");
    const admin = (await resolveAdminAccess(context.userId)).ok;
    if (!admin) {
      const role = await loadCentreRole(sql, context.userId, row.daycare_id);
      const gate = decideScreeningAccess({
        actorRole: role,
        actorUserId: context.userId,
        targetUserId: row.user_id,
        action: centreCanManageScreening(role) ? "manage" : "act_own",
      });
      if (!gate.ok) throw new Error(gate.error);
    }
    return {
      dataUrl: row.storage_ref,
      mime: row.storage_mime || "application/octet-stream",
      filename: row.original_filename || "document",
    };
  });

export const listAdminScreeningQueue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminScreeningQueueRow[]> => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      name: string;
      city: string;
      province: string;
      slug: string;
      display_name: string;
      screening_role: string;
      doc_kind: string;
      status: string;
      original_filename: string | null;
      uploaded_at: string | null;
      issued_on: string | null;
      expires_on: string | null;
    }>`
      select d.id, d.daycare_id, c.name, c.city, c.province, c.slug,
             p.display_name, p.screening_role, d.doc_kind, d.status,
             d.original_filename, d.uploaded_at, d.issued_on::text as issued_on,
             d.expires_on::text as expires_on
      from provider_screening_documents d
      join daycares c on c.id = d.daycare_id
      join provider_screening_people p on p.id = d.person_id
      where d.status in ('uploaded', 'admin_review')
      order by d.updated_at desc
      limit 80
    `.catch(() => []);
    return rows.map((r) => ({
      id: r.id,
      daycareId: r.daycare_id,
      daycareName: r.name,
      city: r.city,
      province: r.province,
      slug: r.slug,
      personName: r.display_name,
      role: (r.screening_role as ScreeningRole) || "staff",
      kind: r.doc_kind as ScreeningDocKind,
      status: r.status as ScreeningDocStatus,
      filename: r.original_filename,
      uploadedAt: r.uploaded_at,
      issuedOn: r.issued_on,
      expiresOn: r.expires_on,
    }));
  });

export const reviewScreeningDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { documentId: string; action: "approve" | "reject"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      status: string;
      doc_kind: string;
    }>`
      select id, daycare_id, status, doc_kind
      from provider_screening_documents where id = ${data.documentId} limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) throw new Error("Document not found");
    const decision = decideAdminScreeningReview({
      action: data.action,
      reason: data.reason,
      currentStatus: row.status as ScreeningDocStatus,
    });
    if (!decision.ok) throw new Error(decision.error);
    const reason = (data.reason || "").trim().slice(0, 500) || null;
    await sql`
      update provider_screening_documents
      set status = ${decision.next},
          reviewer_notes = ${reason},
          reviewed_by = ${context.userId},
          reviewed_at = now(),
          updated_at = now()
      where id = ${row.id}
    `;
    await writeTrustEvent(sql, {
      daycareId: row.daycare_id,
      actorUserId: context.userId,
      kind: data.action === "approve" ? "screening_approve" : "screening_reject",
      note:
        data.action === "approve"
          ? `${row.doc_kind} cleared. KidEase recorded the certificate and did not issue a police check.`
          : `${row.doc_kind} rejected.${reason ? ` ${reason}` : ""}`,
    });
    const screeningOnFile = await refreshScreeningOnFile(sql, row.daycare_id, context.userId);
    return { ok: true as const, status: decision.next, screeningOnFile };
  });
