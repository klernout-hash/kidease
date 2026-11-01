import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { splitFee } from "@/lib/stripe-methods";
import { currentPeriod } from "@/lib/stripe-methods";
import {
  advanceEnrolment,
  enrolmentHandoffEnabled,
  enrolmentHandoffMode,
  envelopeIsSigned,
  feeCentsForAge,
} from "@/lib/wiring/enrolment-handoff";
import { deliverNotice, newId } from "@/lib/server/wiring/runtime";
import { enrolmentPackBody, packTitle, defaultTemplateId } from "@/lib/docusign-packs";

function dollars(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 20000) return null;
  return n;
}

export const enrolmentDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const enabled = enrolmentHandoffEnabled();
    if (!enabled) return { enabled: false as const, mode: "off" as const, rows: [] };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      offer_id: string;
      daycare_id: string;
      step: string;
      province: string;
      fee_cents: number | null;
    }>`
      select id, offer_id, daycare_id, step, province, fee_cents
      from enrolment_handoffs
      where parent_user_id = ${context.userId}
      order by updated_at desc
      limit 20
    `.catch(() => []);
    return { enabled: true as const, mode: enrolmentHandoffMode(), rows };
  });

export const runEnrolmentStep = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId?: string; event?: string }) => ({
    offerId: String(input?.offerId || "").slice(0, 80),
    event: String(input?.event || "").slice(0, 20),
  }))
  .handler(async ({ context, data }) => {
    if (!enrolmentHandoffEnabled()) return { ok: false as const, error: "off" };
    const event = data.event;
    if (event !== "accept" && event !== "packet" && event !== "signed" && event !== "invoice") {
      return { ok: false as const, error: "event" };
    }
    const sql = await getSql();
    const offers = await sql<{
      id: string;
      status: string;
      daycare_id: string;
      age_group: string;
      province: string;
      name: string;
      address: string | null;
      city: string | null;
      infant_monthly: number | null;
      toddler_monthly: number | null;
      preschool_monthly: number | null;
    }>`
      select o.id, o.status, o.daycare_id, o.age_group, d.province, d.name,
             d.address, d.city, d.infant_monthly, d.toddler_monthly, d.preschool_monthly
      from spot_offers o
      join daycares d on d.id = o.daycare_id
      where o.id = ${data.offerId} and o.user_id = ${context.userId}
      limit 1
    `;
    const offer = offers[0];
    if (!offer) return { ok: false as const, error: "offer" };
    const existing = await sql<{ id: string; step: string; envelope_id: string | null; contract_id: string | null }>`
      select id, step, envelope_id, contract_id
      from enrolment_handoffs
      where offer_id = ${offer.id}
      limit 1
    `.catch(() => []);
    const fee = feeCentsForAge({
      ageGroup: offer.age_group,
      infantMonthly: dollars(offer.infant_monthly),
      toddlerMonthly: dollars(offer.toddler_monthly),
      preschoolMonthly: dollars(offer.preschool_monthly),
    });
    let envelopeSigned = false;
    const envelopeId = existing[0]?.envelope_id || null;
    if (envelopeId && enrolmentHandoffMode() === "live") {
      const { getEnvelopeStatus } = await import("@/lib/server/docusign");
      const status = await getEnvelopeStatus(envelopeId);
      envelopeSigned = envelopeIsSigned(status?.status);
    }
    const step = (existing[0]?.step || null) as "accepted" | "packet" | "signed" | "invoiced" | null;
    const next = advanceEnrolment({
      step,
      event,
      offerAccepted: offer.status === "accepted",
      envelopeSigned,
      fee,
    });
    if (!next.ok) return { ok: false as const, error: next.error };
    const mode = enrolmentHandoffMode();
    const id = existing[0]?.id || newId("eh");
    let contractId = existing[0]?.contract_id || null;
    let savedEnvelope = envelopeId;
    if (event === "packet" && mode === "live") {
      const parent = await sql<{ email: string | null; name: string | null }>`
        select email, name from "user" where id = ${context.userId} limit 1
      `;
      const signerEmail = String(parent[0]?.email || "").trim();
      if (!signerEmail) return { ok: false as const, error: "email" };
      contractId = contractId || newId("ct");
      const { createCentreEnvelope } = await import("@/lib/server/docusign");
      const envelope = await createCentreEnvelope({
        contractId,
        packKind: "enrolment_pack",
        documentName: packTitle("enrolment_pack"),
        body: enrolmentPackBody({
          centreName: offer.name,
          address: offer.address || undefined,
          city: offer.city || undefined,
          province: offer.province,
          signerName: parent[0]?.name || "Parent",
          signerEmail,
        }),
        signerName: parent[0]?.name || "Parent",
        signerEmail,
        templateId: defaultTemplateId("enrolment_pack"),
        centreName: offer.name,
      });
      savedEnvelope = envelope.envelopeId;
      await sql`
        insert into daycare_contracts (
          id, daycare_id, provider_user_id, signer_name, signer_email, status,
          envelope_id, signing_url, document_name, sent_at, last_event, pack_kind, template_id
        ) values (
          ${contractId}, ${offer.daycare_id}, ${context.userId}, ${parent[0]?.name || "Parent"},
          ${signerEmail}, ${envelope.status || "sent"}, ${envelope.envelopeId}, ${envelope.signingUrl},
          ${packTitle("enrolment_pack")}, now(), ${envelope.mode}, ${"enrolment_pack"}, ${defaultTemplateId("enrolment_pack")}
        )
      `;
    }
    let invoiceId: string | null = null;
    if (event === "invoice" && mode === "live" && next.invoiceCents != null) {
      const amountCad = Math.round(next.invoiceCents / 100);
      const split = splitFee(next.invoiceCents);
      invoiceId = newId("bl");
      const number = `KE-${invoiceId.slice(-8).toUpperCase()}`;
      await sql`
        insert into invoices (
          id, number, parent_user_id, daycare_id, period, status, currency,
          subtotal, platform_fee, total, amount_cents, platform_fee_cents, net_cents,
          issued_by, memo, created_by
        ) values (
          ${invoiceId}, ${number}, ${context.userId}, ${offer.daycare_id}, ${currentPeriod()}, ${"draft"}, ${"cad"},
          ${amountCad}, ${Math.round(split.platformFee / 100)}, ${amountCad},
          ${next.invoiceCents}, ${split.platformFee}, ${split.net},
          ${"provider"}, ${"First invoice after enrolment"}, ${context.userId}
        )
      `;
    }
    const persistedStep = event === "invoice" && mode !== "live" ? step || "signed" : next.step;
    if (existing[0]) {
      await sql`
        update enrolment_handoffs
        set step = ${persistedStep}, contract_id = ${contractId}, envelope_id = ${savedEnvelope},
            invoice_id = coalesce(${invoiceId}, invoice_id), fee_cents = ${"cents" in fee ? fee.cents : null},
            updated_at = now()
        where id = ${id}
      `;
    } else {
      await sql`
        insert into enrolment_handoffs (
          id, offer_id, daycare_id, parent_user_id, province, age_group, step, contract_id, envelope_id, invoice_id, fee_cents
        ) values (
          ${id}, ${offer.id}, ${offer.daycare_id}, ${context.userId}, ${offer.province}, ${offer.age_group},
          ${persistedStep}, ${contractId}, ${savedEnvelope}, ${invoiceId}, ${"cents" in fee ? fee.cents : null}
        )
      `;
    }
    const plan = await deliverNotice({
      feature: "enrolment_handoff",
      flag: "FEATURE_ENROLMENT_HANDOFF",
      mode,
      userId: context.userId,
      role: "parent",
      title: "Enrolment update",
      body: `Your enrolment step is ${persistedStep}.`,
      href: "/parent/enrolment-handoff",
      province: offer.province,
      wantSms: true,
    });
    return { ok: true as const, step: persistedStep, mode, plan, invoiceCents: next.step === "invoiced" ? next.invoiceCents ?? null : null };
  });
