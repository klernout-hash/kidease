import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { lookupUser, notifyPlatform } from "@/lib/server/notify";
import { requireAdmin, resolveAdminAccess } from "@/lib/server/roles";
import {
  CENTRE_AGREEMENT_TITLE,
  packDocumentBody,
  packTitle,
  parsePackKind,
  type PackKind,
} from "@/lib/contracts";
import { nid } from "@/lib/utils";
import {
  applyEnvelopeEvent,
  createCentreEnvelope,
  defaultTemplateIds,
  docusignMode,
  getEnvelopeStatus,
  listDocusignTemplates,
  persistSignedPdf,
  voidCentreEnvelope,
} from "@/lib/server/docusign";
import type { DocusignTemplateOption } from "@/lib/docusign-packs";

export type ContractStatus = "draft" | "sent" | "viewed" | "signed" | "declined" | "voided";

export type AdminPackRow = {
  packKind: PackKind;
  contractId: string | null;
  status: ContractStatus | "none";
  signerName: string | null;
  signerEmail: string | null;
  envelopeId: string | null;
  signingUrl: string | null;
  templateId: string | null;
  documentName: string;
  sentAt: string | null;
  signedAt: string | null;
  lastEvent: string | null;
  hasSignedPdf: boolean;
};

export type AdminContractRow = {
  daycareId: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  licence: string | null;
  providerUserId: string | null;
  providerName: string | null;
  providerEmail: string | null;
  contactEmail: string | null;
  packs: AdminPackRow[];
};

export type ProviderContractRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  city: string;
  packKind: PackKind;
  status: string;
  signerName: string | null;
  signerEmail: string;
  signingUrl: string | null;
  documentName: string;
  sentAt: string | null;
  signedAt: string | null;
  hasSignedPdf: boolean;
  body: string;
};

export type AdminContractsPayload = {
  mode: "live" | "demo";
  templates: DocusignTemplateOption[];
  defaultTemplateIds: { provider_agreement: string | null; enrolment_pack: string | null };
  templateRole: string;
  rows: AdminContractRow[];
};

async function requireOperator(userId: string) {
  return requireAdmin(userId);
}

async function isOperator(userId: string) {
  const access = await resolveAdminAccess(userId);
  return access.ok;
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emptyPack(kind: PackKind): AdminPackRow {
  return {
    packKind: kind,
    contractId: null,
    status: "none",
    signerName: null,
    signerEmail: null,
    envelopeId: null,
    signingUrl: null,
    templateId: null,
    documentName: packTitle(kind),
    sentAt: null,
    signedAt: null,
    lastEvent: null,
    hasSignedPdf: false,
  };
}

export const listAdminContracts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminContractsPayload> => {
    await requireOperator(context.userId);
    const sql = await getSql();
    const centres = await sql<{
      daycare_id: string;
      slug: string;
      name: string;
      address: string;
      city: string;
      province: string;
      licence: string | null;
      provider_user_id: string | null;
      provider_name: string | null;
      provider_email: string | null;
      contact_email: string | null;
    }>`
      select distinct on (d.id)
        d.id as daycare_id,
        d.slug,
        d.name,
        d.address,
        d.city,
        d.province,
        d.license_number as licence,
        coalesce(pd.user_id, c.user_id) as provider_user_id,
        u.name as provider_name,
        u.email as provider_email,
        d.contact_email
      from daycares d
      left join provider_daycares pd on pd.daycare_id = d.id
      left join listing_claims c on c.daycare_id = d.id
      left join "user" u on u.id = coalesce(pd.user_id, c.user_id)
      where d.claimed_at is not null
         or d.claim_status in ('pending', 'waiting', 'verified', 'approved')
         or pd.user_id is not null
         or c.id is not null
      order by d.id
    `.catch(() => []);

    const contracts = await sql<{
      id: string;
      daycare_id: string;
      pack_kind: string | null;
      status: string | null;
      signer_name: string | null;
      signer_email: string | null;
      envelope_id: string | null;
      signing_url: string | null;
      template_id: string | null;
      document_name: string | null;
      sent_at: string | null;
      signed_at: string | null;
      last_event: string | null;
      signed_pdf_key: string | null;
    }>`
      select distinct on (dc.daycare_id, coalesce(dc.pack_kind, 'provider_agreement'))
        dc.id, dc.daycare_id, dc.pack_kind, dc.status, dc.signer_name, dc.signer_email,
        dc.envelope_id, dc.signing_url, dc.template_id, dc.document_name,
        dc.sent_at, dc.signed_at, dc.last_event, dc.signed_pdf_key
      from daycare_contracts dc
      order by dc.daycare_id, coalesce(dc.pack_kind, 'provider_agreement'), dc.created_at desc
    `.catch(() => []);

    const byCentre = new Map<string, AdminPackRow[]>();
    for (const row of contracts) {
      const kind = parsePackKind(row.pack_kind);
      const pack: AdminPackRow = {
        packKind: kind,
        contractId: row.id,
        status: (row.status as ContractStatus) || "none",
        signerName: row.signer_name,
        signerEmail: row.signer_email,
        envelopeId: row.envelope_id,
        signingUrl: row.signing_url,
        templateId: row.template_id,
        documentName: row.document_name || packTitle(kind),
        sentAt: row.sent_at,
        signedAt: row.signed_at,
        lastEvent: row.last_event,
        hasSignedPdf: Boolean(row.signed_pdf_key) || row.status === "signed",
      };
      const list = byCentre.get(row.daycare_id) || [];
      list.push(pack);
      byCentre.set(row.daycare_id, list);
    }

    const mapped: AdminContractRow[] = centres.map((r) => {
      const found = byCentre.get(r.daycare_id) || [];
      const packs: AdminPackRow[] = [
        found.find((p) => p.packKind === "provider_agreement") || emptyPack("provider_agreement"),
        found.find((p) => p.packKind === "enrolment_pack") || emptyPack("enrolment_pack"),
      ];
      return {
        daycareId: r.daycare_id,
        slug: r.slug,
        name: r.name,
        address: r.address,
        city: r.city,
        province: r.province,
        licence: r.licence,
        providerUserId: r.provider_user_id,
        providerName: r.provider_name,
        providerEmail: r.provider_email,
        contactEmail: r.contact_email,
        packs,
      };
    });

    const packRank = (row: AdminContractRow) => {
      const statuses = row.packs.map((p) => p.status);
      if (statuses.some((s) => s === "none" || s === "draft" || s === "declined" || s === "voided")) return 0;
      if (statuses.some((s) => s === "sent" || s === "viewed")) return 1;
      return 2;
    };
    mapped.sort((a, b) => packRank(a) - packRank(b) || a.name.localeCompare(b.name));

    const templates = docusignMode() === "live" ? await listDocusignTemplates() : [];
    return {
      mode: docusignMode(),
      templates,
      defaultTemplateIds: defaultTemplateIds(),
      templateRole: (process.env.DOCUSIGN_TEMPLATE_ROLE || "Provider").trim() || "Provider",
      rows: mapped,
    };
  });

export const sendCentreContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      packKind?: PackKind;
      templateId?: string;
      signerName?: string;
      signerEmail?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const actor = await requireOperator(context.userId);
    const packKind = parsePackKind(data.packKind);
    const sql = await getSql();
    const listed = await sql<{
      id: string;
      slug: string;
      name: string;
      address: string;
      city: string;
      province: string;
      license_number: string | null;
      contact_email: string | null;
    }>`
      select id, slug, name, address, city, province, license_number, contact_email
      from daycares where id = ${data.daycareId} limit 1
    `;
    const centre = listed[0];
    if (!centre) throw new Error("Centre not found");

    const owner = await sql<{ user_id: string; name: string | null; email: string | null }>`
      select coalesce(pd.user_id, c.user_id) as user_id, u.name, u.email
      from daycares d
      left join provider_daycares pd on pd.daycare_id = d.id
      left join listing_claims c on c.daycare_id = d.id
      left join "user" u on u.id = coalesce(pd.user_id, c.user_id)
      where d.id = ${data.daycareId}
      limit 1
    `.catch(() => []);

    const signerEmail = (data.signerEmail || owner[0]?.email || centre.contact_email || "").trim().toLowerCase();
    const signerName = (data.signerName || owner[0]?.name || "Centre operator").trim();
    if (!validEmail(signerEmail)) throw new Error("This centre needs a signer email first");

    const open = await sql<{ id: string; envelope_id: string | null }>`
      select id, envelope_id from daycare_contracts
      where daycare_id = ${data.daycareId}
        and coalesce(pack_kind, 'provider_agreement') = ${packKind}
        and status in ('draft', 'sent', 'viewed')
      order by created_at desc
    `.catch(() => []);
    for (const row of open) {
      if (row.envelope_id) {
        try {
          await voidCentreEnvelope(row.envelope_id);
        } catch (err) {
          console.error("[docusign] void previous failed", err);
        }
      }
      await sql`update daycare_contracts set status = ${"voided"}, last_event = ${"replaced"}, updated_at = now() where id = ${row.id}`.catch(
        () => undefined,
      );
    }

    const contractId = nid("ct");
    const body = packDocumentBody(packKind, {
      centreName: centre.name,
      address: centre.address,
      city: centre.city,
      province: centre.province,
      licence: centre.license_number || undefined,
      signerName,
      signerEmail,
    });
    const documentName = packKind === "enrolment_pack" ? packTitle(packKind) : CENTRE_AGREEMENT_TITLE;
    const templateId = (data.templateId || defaultTemplateIds()[packKind] || "").trim() || null;

    const envelope = await createCentreEnvelope({
      contractId,
      packKind,
      documentName,
      body,
      signerName,
      signerEmail,
      templateId,
      centreName: centre.name,
    });

    await sql.query(
      `insert into daycare_contracts (
        id, daycare_id, provider_user_id, signer_name, signer_email, status,
        envelope_id, signing_url, document_name, sent_at, last_event,
        pack_kind, template_id
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12)`,
      [
        contractId,
        centre.id,
        owner[0]?.user_id || null,
        signerName,
        signerEmail,
        envelope.status === "sent" ? "sent" : envelope.status,
        envelope.envelopeId,
        envelope.signingUrl,
        documentName,
        envelope.mode,
        packKind,
        templateId,
      ],
    );

    try {
      await notifyPlatform({
        kind: "listing",
        title: `Contract sent: ${centre.name}`,
        daycareName: centre.name,
        address: centre.address,
        city: centre.city,
        province: centre.province,
        slug: centre.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `${documentName} sent to ${signerName} <${signerEmail}> via ${envelope.mode === "live" ? "DocuSign" : "in-app signing"}.`,
      });
    } catch (err) {
      console.error("[contracts] notify failed", err);
    }

    return {
      ok: true as const,
      contractId,
      envelopeId: envelope.envelopeId,
      signingUrl: envelope.signingUrl,
      mode: envelope.mode,
      signerEmail,
      packKind,
    };
  });

export const voidCentreContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { contractId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: string; envelope_id: string | null }>`
      select id, envelope_id from daycare_contracts where id = ${data.contractId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Contract not found");
    if (row.envelope_id) {
      try {
        await voidCentreEnvelope(row.envelope_id);
      } catch (err) {
        console.error("[docusign] void failed", err);
      }
    }
    await sql`update daycare_contracts set status = ${"voided"}, last_event = ${"voided"}, updated_at = now() where id = ${row.id}`;
    return { ok: true as const };
  });

export const syncCentreContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { contractId: string }) => input)
  .handler(async ({ context, data }) => {
    await requireOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      envelope_id: string | null;
      status: string;
      signed_pdf_key: string | null;
    }>`
      select id, daycare_id, envelope_id, status, signed_pdf_key
      from daycare_contracts where id = ${data.contractId} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Contract not found");
    if (!row.envelope_id) return { ok: true as const, status: row.status };
    const remote = await getEnvelopeStatus(row.envelope_id);
    if (remote) await applyEnvelopeEvent(remote);
    if ((remote?.status === "signed" || row.status === "signed") && !row.signed_pdf_key) {
      await persistSignedPdf({
        contractId: row.id,
        daycareId: row.daycare_id,
        envelopeId: row.envelope_id,
      });
    }
    return { ok: true as const, status: remote?.status || row.status };
  });

export const listProviderContracts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      city: string;
      pack_kind: string | null;
      status: string;
      signer_name: string | null;
      signer_email: string;
      signing_url: string | null;
      document_name: string;
      sent_at: string | null;
      signed_at: string | null;
      signed_pdf_key: string | null;
      address: string;
      province: string;
      licence: string | null;
    }>`
      select dc.id, dc.daycare_id, d.name as daycare_name, d.city,
             dc.pack_kind, dc.status, dc.signer_name, dc.signer_email, dc.signing_url,
             dc.document_name, dc.sent_at, dc.signed_at, dc.signed_pdf_key,
             d.address, d.province, d.license_number as licence
      from daycare_contracts dc
      join daycares d on d.id = dc.daycare_id
      join provider_daycares pd on pd.daycare_id = dc.daycare_id and pd.user_id = ${context.userId}
      where dc.status <> 'voided'
      order by dc.created_at desc
    `.catch(() => []);

    return rows.map((r) => {
      const packKind = parsePackKind(r.pack_kind);
      return {
        id: r.id,
        daycareId: r.daycare_id,
        daycareName: r.daycare_name,
        city: r.city,
        packKind,
        status: r.status,
        signerName: r.signer_name,
        signerEmail: r.signer_email,
        signingUrl: r.signing_url,
        documentName: r.document_name,
        sentAt: r.sent_at,
        signedAt: r.signed_at,
        hasSignedPdf: Boolean(r.signed_pdf_key) || r.status === "signed",
        body: packDocumentBody(packKind, {
          centreName: r.daycare_name,
          address: r.address,
          city: r.city,
          province: r.province,
          licence: r.licence || undefined,
          signerName: r.signer_name || undefined,
          signerEmail: r.signer_email,
        }),
      };
    }) satisfies ProviderContractRow[];
  });

export const getSignContract = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { contractId: string }) => input)
  .handler(async ({ context, data }) => {
    const admin = await isOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      address: string;
      city: string;
      province: string;
      licence: string | null;
      pack_kind: string | null;
      status: string;
      signer_name: string | null;
      signer_email: string;
      signing_url: string | null;
      envelope_id: string | null;
      document_name: string;
      provider_user_id: string | null;
      signed_pdf_key: string | null;
    }>`
      select dc.id, dc.daycare_id, d.name as daycare_name, d.address, d.city, d.province,
             d.license_number as licence, dc.pack_kind, dc.status, dc.signer_name, dc.signer_email,
             dc.signing_url, dc.envelope_id, dc.document_name, dc.provider_user_id, dc.signed_pdf_key
      from daycare_contracts dc
      join daycares d on d.id = dc.daycare_id
      where dc.id = ${data.contractId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Contract not found");
    const owned = await sql<{ ok: number }>`
      select 1 as ok from provider_daycares
      where daycare_id = ${row.daycare_id} and user_id = ${context.userId}
      limit 1
    `.catch(() => []);
    if (!admin && !owned[0] && row.provider_user_id !== context.userId) {
      throw new Error("Not authorized");
    }
    const packKind = parsePackKind(row.pack_kind);
    return {
      id: row.id,
      daycareName: row.daycare_name,
      packKind,
      status: row.status,
      signerName: row.signer_name,
      signerEmail: row.signer_email,
      signingUrl: row.signing_url,
      documentName: row.document_name,
      envelopeId: row.envelope_id,
      hasSignedPdf: Boolean(row.signed_pdf_key) || row.status === "signed",
      demo: !row.envelope_id || row.envelope_id.startsWith("demo_"),
      body: packDocumentBody(packKind, {
        centreName: row.daycare_name,
        address: row.address,
        city: row.city,
        province: row.province,
        licence: row.licence || undefined,
        signerName: row.signer_name || undefined,
        signerEmail: row.signer_email,
      }),
    };
  });

export const signCentreContract = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { contractId: string }) => input)
  .handler(async ({ context, data }) => {
    const actor = await lookupUser(context.userId);
    const admin = await isOperator(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      status: string;
      signer_name: string | null;
      envelope_id: string | null;
      provider_user_id: string | null;
    }>`
      select dc.id, dc.daycare_id, d.name as daycare_name, dc.status, dc.signer_name,
             dc.envelope_id, dc.provider_user_id
      from daycare_contracts dc
      join daycares d on d.id = dc.daycare_id
      where dc.id = ${data.contractId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Contract not found");
    const owned = await sql<{ ok: number }>`
      select 1 as ok from provider_daycares
      where daycare_id = ${row.daycare_id} and user_id = ${context.userId}
      limit 1
    `.catch(() => []);
    if (!admin && !owned[0] && row.provider_user_id !== context.userId) {
      throw new Error("Not authorized");
    }
    if (row.status === "signed") return { ok: true as const, status: "signed" };
    if (row.status === "voided" || row.status === "declined") throw new Error("This contract is closed");
    const demo = !row.envelope_id || row.envelope_id.startsWith("demo_");
    if (!demo) throw new Error("Open the DocuSign link to finish signing this contract");
    await applyEnvelopeEvent({
      envelopeId: row.envelope_id || `demo_${data.contractId}`,
      status: "signed",
      event: "in-app-sign",
    });
    try {
      await notifyPlatform({
        kind: "listing",
        title: `Contract signed: ${row.daycare_name}`,
        daycareName: row.daycare_name,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `${row.signer_name || actor.name} signed KidEase paperwork.`,
      });
    } catch (err) {
      console.error("[contracts] signed notify failed", err);
    }
    return { ok: true as const, status: "signed" };
  });
