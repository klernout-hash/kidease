import { agreementTemplateV2, DIRECTOR_ANCHORS, guardianAnchors, parentAgreementDocumentV2 } from "../parent-agreement-v2.ts";
import { isHomeDaycare } from "../home-address-privacy.ts";
import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { canCentreWriteLeadsFor, listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { appOrigin, createCentreEnvelope, docusignConfig, voidCentreEnvelope } from "@/lib/server/docusign";
import { coparentLinkEnabled, parentAgreementEnabled } from "@/lib/features";
import { nid } from "@/lib/utils";
import {
  PARENT_AGREEMENT_PACK,
  acceptedEnrolmentStatus,
  agreementPhotoUrl,
  canViewParentAgreement,
  defaultAgreementTerms,
  isIsoDate,
  isParentAgreementStatus,
  isStartDate,
  normalizeAgreementTerms,
  parentAgreementBlurb,
  parentAgreementDocument,
  parentAgreementSubject,
  termsReady,
  validEmail,
  type AgreementErrorCode,
  type AgreementTerms,
  type ParentAgreementStatus,
} from "@/lib/parent-agreement";

export type ParentAgreementChip = {
  agreementId: string;
  contractId: string;
  bookingId: string | null;
  childId: string | null;
  daycareId: string;
  daycareName: string;
  childName: string;
  status: ParentAgreementStatus;
  startDate: string;
  feeEn: string;
  feeFr: string;
  feePeriod: AgreementTerms["feePeriod"];
  hasSignedPdf: boolean;
};

export type CentreAgreementDesk = {
  enabled: boolean;
  centres: {
    id: string;
    name: string;
    terms: AgreementTerms;
    agreements: ParentAgreementChip[];
  }[];
};

function deny(code: AgreementErrorCode): never {
  throw new Error(`agreement:${code}`);
}

function asTerms(value: unknown): AgreementTerms {
  if (typeof value === "string") {
    try {
      return normalizeAgreementTerms(JSON.parse(value) as Partial<AgreementTerms>);
    } catch {
      return defaultAgreementTerms();
    }
  }
  return normalizeAgreementTerms((value || null) as Partial<AgreementTerms> | null);
}

type AgreementRow = {
  id: string;
  contract_id: string;
  daycare_id: string;
  daycare_name: string;
  booking_id: string | null;
  child_id: string | null;
  parent_user_id: string;
  child_name: string;
  status: string;
  start_date: string;
  terms: unknown;
  signed_pdf_key: string | null;
};

function toChip(row: AgreementRow): ParentAgreementChip {
  const terms = asTerms(row.terms);
  return {
    agreementId: row.id,
    contractId: row.contract_id,
    bookingId: row.booking_id,
    childId: row.child_id,
    daycareId: row.daycare_id,
    daycareName: row.daycare_name,
    childName: row.child_name,
    status: isParentAgreementStatus(row.status) ? row.status : "draft",
    startDate: row.start_date || "",
    feeEn: terms.feeEn,
    feeFr: terms.feeFr,
    feePeriod: terms.feePeriod,
    hasSignedPdf: Boolean(row.signed_pdf_key) || row.status === "completed",
  };
}

async function centreUserIds(sql: Sql, daycareId: string) {
  const owners = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${daycareId}
  `.catch(() => []);
  const members = await sql<{ user_id: string }>`
    select user_id from centre_members
    where daycare_id = ${daycareId} and status = 'active'
  `.catch(() => []);
  return [...new Set([...owners, ...members].map((row) => row.user_id).filter(Boolean))];
}

async function linkedCoparentIds(sql: Sql, childId: string) {
  if (!childId || !coparentLinkEnabled()) return [];
  const reg = await sql<{ reg: string | null }>`
    select to_regclass('public.child_coparent_links')::text as reg
  `.catch(() => []);
  if (!reg[0]?.reg) return [];
  const rows = await sql.query<{ user_id: string }>(
    `select linked_user_id as user_id
       from child_coparent_links
      where child_id = $1 and status in ('linked', 'active')`,
    [childId],
  ).catch(() => []);
  return rows.map((row) => row.user_id).filter(Boolean);
}

async function viewerCanRead(sql: Sql, viewerId: string, row: { parent_user_id: string; daycare_id: string; child_id: string | null }) {
  const [centreIds, coparents] = await Promise.all([
    centreUserIds(sql, row.daycare_id),
    row.child_id ? linkedCoparentIds(sql, row.child_id) : Promise.resolve([]),
  ]);
  return canViewParentAgreement({
    viewerId,
    parentUserId: row.parent_user_id,
    centreUserIds: centreIds,
    coparentUserIds: coparents,
    coparentFlag: coparentLinkEnabled(),
  });
}

const AGREEMENT_SELECT = `
  select a.id, a.contract_id, a.daycare_id, d.name as daycare_name, a.booking_id, a.child_id,
         a.parent_user_id, a.child_name, a.status, a.start_date, a.terms, c.signed_pdf_key
    from parent_enrolment_agreements a
    join daycares d on d.id = a.daycare_id
    join daycare_contracts c on c.id = a.contract_id
`;

export const loadCentreAgreementEditor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<CentreAgreementDesk> => {
    if (!parentAgreementEnabled()) return { enabled: false, centres: [] };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const writable: string[] = [];
    for (const id of ids) {
      if (await canCentreWriteLeadsFor(sql, context.userId, id)) writable.push(id);
    }
    if (!writable.length) return { enabled: true, centres: [] };
    const centres = await sql.query<{ id: string; name: string }>(
      `select id, name from daycares where id = any($1::text[]) order by name`,
      [writable],
    );
    const stored = await sql.query<{ daycare_id: string; terms: unknown }>(
      `select daycare_id, terms from centre_agreement_terms where daycare_id = any($1::text[])`,
      [writable],
    ).catch(() => []);
    const agreements = await sql.query<AgreementRow>(
      `${AGREEMENT_SELECT}
        where a.daycare_id = any($1::text[])
        order by a.updated_at desc
        limit 40`,
      [writable],
    ).catch(() => []);
    const termsByCentre = new Map(stored.map((row) => [row.daycare_id, asTerms(row.terms)]));
    return {
      enabled: true,
      centres: centres.map((centre) => ({
        id: centre.id,
        name: centre.name,
        terms: termsByCentre.get(centre.id) || defaultAgreementTerms(),
        agreements: agreements.filter((row) => row.daycare_id === centre.id).map(toChip),
      })),
    };
  });

export const saveCentreAgreementTerms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; terms: AgreementTerms }) => input)
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) deny("signing_off");
    const sql = await getSql();
    const allowed = await canCentreWriteLeadsFor(sql, context.userId, data.daycareId);
    if (!allowed) deny("not_your_centre");
    const terms = normalizeAgreementTerms(data.terms);
    const problem = termsReady(terms);
    if (problem) deny(problem);
    await sql.query(
      `insert into centre_agreement_terms (daycare_id, terms, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (daycare_id) do update
         set terms = excluded.terms, updated_at = now()`,
      [data.daycareId, JSON.stringify(terms)],
    );
    return { ok: true as const, terms };
  });

export const listCentreAgreementChips = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!parentAgreementEnabled()) return { enabled: false as const, rows: [] as ParentAgreementChip[] };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) return { enabled: true as const, rows: [] as ParentAgreementChip[] };
    const rows = await sql.query<AgreementRow>(
      `${AGREEMENT_SELECT}
        where a.daycare_id = any($1::text[])
        order by a.updated_at desc`,
      [ids],
    ).catch(() => []);
    return { enabled: true as const, rows: rows.map(toChip) };
  });

export const listChildAgreements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId: string }) => input)
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) return { enabled: false as const, rows: [] as ParentAgreementChip[] };
    const childId = String(data.childId || "").trim();
    if (!childId) return { enabled: true as const, rows: [] as ParentAgreementChip[] };
    const sql = await getSql();
    const rows = await sql.query<AgreementRow>(
      `${AGREEMENT_SELECT} where a.child_id = $1 order by a.updated_at desc`,
      [childId],
    ).catch(() => []);
    const visible: ParentAgreementChip[] = [];
    for (const row of rows) {
      if (await viewerCanRead(sql, context.userId, row)) visible.push(toChip(row));
    }
    return { enabled: true as const, rows: visible };
  });

export const voidParentAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agreementId: string }) => input)
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) deny("signing_off");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      contract_id: string;
      daycare_id: string;
      status: string;
      envelope_id: string | null;
    }>`
      select a.id, a.contract_id, a.daycare_id, a.status, c.envelope_id
        from parent_enrolment_agreements a
        join daycare_contracts c on c.id = a.contract_id
       where a.id = ${data.agreementId}
       limit 1
    `;
    const row = rows[0];
    if (!row) deny("not_found");
    const allowed = await canCentreWriteLeadsFor(sql, context.userId, row.daycare_id);
    if (!allowed) deny("not_your_centre");
    if (row.status === "completed") deny("void_blocked");
    if (row.status === "void") return { ok: true as const, status: "void" as const };
    if (row.envelope_id) {
      await voidCentreEnvelope(row.envelope_id, "The centre voided this enrolment agreement");
    }
    await sql`update daycare_contracts set status = ${"void"}, last_event = ${"void"}, updated_at = now() where id = ${row.contract_id}`;
    await sql`update parent_enrolment_agreements set status = ${"void"}, updated_at = now() where id = ${row.id}`;
    return { ok: true as const, status: "void" as const };
  });

export const sendParentAgreement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId: string }) => input)
  .handler(async ({ context, data }) => {
    if (!parentAgreementEnabled()) deny("signing_off");
    if (!docusignConfig()) deny("docusign_off");
    const sql = await getSql();
    const bookings = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      child_id: string | null;
      status: string;
      start_date: string | null;
      start_month: string | null;
      days: string | null;
      parent_name: string | null;
    }>`
      select id, user_id, daycare_id, child_id, status, start_date, start_month, days, parent_name
        from bookings
       where id = ${data.bookingId}
       limit 1
    `;
    const booking = bookings[0];
    if (!booking) deny("not_found");
    const allowed = await canCentreWriteLeadsFor(sql, context.userId, booking.daycare_id);
    if (!allowed) deny("not_your_centre");
    if (!acceptedEnrolmentStatus(booking.status)) deny("not_accepted");
    if (!booking.child_id) deny("child_required");

    const open = await sql<{ id: string }>`
      select id from parent_enrolment_agreements
       where booking_id = ${booking.id}
         and status in ('draft', 'sent', 'parent_signed')
       limit 1
    `.catch(() => []);
    if (open[0]) deny("already_sent");

    const children = await sql<{ name: string; birthdate: string | null }>`
      select name, birthdate from children
       where id = ${booking.child_id} and user_id = ${booking.user_id}
       limit 1
    `;
    const child = children[0];
    if (!child) deny("child_required");
    const childName = child.name.trim();
    const birthdate = String(child.birthdate || "").slice(0, 10);
    if (!childName) deny("child_required");
    if (!isIsoDate(birthdate)) deny("birthdate_required");

    const people = await sql<{ id: string; name: string | null; email: string | null }>`
      select id, name, email from "user" where id in (${booking.user_id}, ${context.userId})
    `;
    const parent = people.find((row) => row.id === booking.user_id);
    const director = people.find((row) => row.id === context.userId);
    const parentName = (parent?.name || booking.parent_name || "").trim();
    const parentEmail = (parent?.email || "").trim().toLowerCase();
    const directorName = (director?.name || "").trim();
    const directorEmail = (director?.email || "").trim().toLowerCase();
    if (!parentName || !directorName) deny("parent_required");
    if (!validEmail(parentEmail) || !validEmail(directorEmail)) deny("email_required");
    if (parentEmail === directorEmail) deny("same_email");

    const centres = await sql<{
      name: string;
      address: string | null;
      city: string | null;
      province: string | null;
      licence: string | null;
      photos: string | null;
      facility_type?: string | null;
      amenities?: string | null;
    }>`
      select name, address, city, province, license_number as licence, photos,
             facility_type, amenities
        from daycares where id = ${booking.daycare_id} limit 1
    `;
    const centre = centres[0];
    if (!centre) deny("not_found");

    const stored = await sql<{ terms: unknown }>`
      select terms from centre_agreement_terms where daycare_id = ${booking.daycare_id} limit 1
    `.catch(() => []);
    const terms = asTerms(stored[0]?.terms);
    const problem = termsReady(terms);
    if (problem) deny(problem);
    const start = [booking.start_date, booking.start_month, terms.startDate].map((value) => String(value || "").slice(0, 10)).find((value) => isStartDate(value)) || "";
    if (!isStartDate(start)) deny("start_required");
    const agreedDays = String(booking.days || "").trim();

    const v2 = agreementTemplateV2();
    const partyFields = {
      centreName: centre.name,
      address: centre.address || "",
      city: centre.city || "",
      provinceCode: centre.province || "",
      licence: centre.licence || "",
      photoUrl: agreementPhotoUrl(appOrigin(), centre.photos),
      parentName,
      childName,
      childBirthdate: birthdate,
      directorName,
      startDate: start,
      daysEn: agreedDays || undefined,
      daysFr: agreedDays || undefined,
    };
    const body = v2
      ? parentAgreementDocumentV2(terms, {
          ...partyFields,
          isHomeDaycare: isHomeDaycare({ facilityType: centre.facility_type, amenities: centre.amenities } as never),
          guardians: [{ name: parentName, email: parentEmail }],
        })
      : parentAgreementDocument(terms, partyFields);
    const parentAnchors = guardianAnchors(0);

    const contractId = nid("ct");
    const agreementId = nid("pa");
    const envelope = await createCentreEnvelope({
      contractId,
      packKind: PARENT_AGREEMENT_PACK,
      documentName: "Enrolment agreement",
      body,
      signerName: parentName,
      signerEmail: parentEmail,
      centreName: centre.name,
      fileExtension: "html",
      emailSubject: parentAgreementSubject(centre.name, childName),
      emailBlurb: parentAgreementBlurb(),
      signers: [
        {
          email: parentEmail,
          name: parentName,
          recipientId: "1",
          routingOrder: "1",
          anchorString: v2 ? parentAnchors.sign : "Parent signature / Signature du parent",
          ...(v2 ? { initialAnchor: parentAnchors.initial, dateAnchor: parentAnchors.date } : {}),
          roleName: "Parent",
        },
        {
          email: directorEmail,
          name: directorName,
          recipientId: "2",
          routingOrder: "2",
          anchorString: v2 ? DIRECTOR_ANCHORS.sign : "Centre signature / Signature du centre",
          ...(v2 ? { initialAnchor: DIRECTOR_ANCHORS.initial, dateAnchor: DIRECTOR_ANCHORS.date } : {}),
          roleName: "Director",
        },
      ],
    });

    try {
      await sql.query(
        `insert into daycare_contracts (
           id, daycare_id, provider_user_id, signer_name, signer_email, status,
           envelope_id, signing_url, document_name, sent_at, last_event, pack_kind
         ) values ($1,$2,$3,$4,$5,'sent',$6,null,$7,now(),$8,$9)`,
        [
          contractId,
          booking.daycare_id,
          context.userId,
          parentName,
          parentEmail,
          envelope.envelopeId,
          "Enrolment agreement",
          "docusign",
          PARENT_AGREEMENT_PACK,
        ],
      );
      await sql.query(
        `insert into parent_enrolment_agreements (
           id, contract_id, daycare_id, booking_id, child_id, parent_user_id,
           child_name, child_birthdate, parent_name, parent_email,
           director_user_id, director_name, director_email, status, start_date, terms
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'sent',$14,$15::jsonb)`,
        [
          agreementId,
          contractId,
          booking.daycare_id,
          booking.id,
          booking.child_id,
          booking.user_id,
          childName,
          birthdate,
          parentName,
          parentEmail,
          context.userId,
          directorName,
          directorEmail,
          start,
          JSON.stringify(terms),
        ],
      );
    } catch (err) {
      await voidCentreEnvelope(envelope.envelopeId, "KidEase could not store the agreement").catch(() => undefined);
      throw err;
    }

    return { ok: true as const, agreementId, contractId, status: "sent" as const };
  });

export async function parentAgreementReadable(sql: Sql, viewerId: string, contractId: string) {
  const rows = await sql.query<{ parent_user_id: string; daycare_id: string; child_id: string | null }>(
    `select parent_user_id, daycare_id, child_id
       from parent_enrolment_agreements
      where contract_id = $1
      limit 1`,
    [contractId],
  ).catch(() => []);
  const row = rows[0];
  if (!row) return false;
  return viewerCanRead(sql, viewerId, row);
}
