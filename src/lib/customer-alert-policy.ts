/**
 * Prospective parent and daycare alerts.
 * Anything before the cutoff stays unsent. A missing time fails closed.
 * Summaries name the centre only. They do not include the message.
 */

export const CUSTOMER_ALERT_NOT_BEFORE = "2026-11-09T02:45:00.000Z";

const CUTOFF_MS = Date.parse(CUSTOMER_ALERT_NOT_BEFORE);

export function customerAlertCutoffMs(): number {
  return CUTOFF_MS;
}

/** True only for an event at or after the activation cutoff. */
export function alertIsProspective(createdAt: string | Date | null | undefined): boolean {
  if (!Number.isFinite(CUTOFF_MS)) return false;
  if (createdAt == null) return false;
  const ms = createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt));
  if (!Number.isFinite(ms)) return false;
  return ms >= CUTOFF_MS;
}

export function sameMailbox(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

export function customerAlertSummary(input: {
  kind: "message" | "tour";
  centreName: string;
  locale?: string | null;
  tour?: "confirmed" | "declined" | null;
}): { subject: string; preview: string } {
  const centre = String(input.centreName || "").replace(/\s+/g, " ").trim().slice(0, 80) || "your daycare";
  const fr = input.locale === "fr";
  if (input.kind === "tour") {
    if (input.tour === "declined") {
      return fr
        ? { subject: `Visite non retenue : ${centre}`, preview: `${centre} n'a pas retenu cette visite. Ouvrez KidEase pour la suite.` }
        : { subject: `Tour declined: ${centre}`, preview: `${centre} did not confirm this tour. Open KidEase for the next step.` };
    }
    return fr
      ? { subject: `Visite confirmée : ${centre}`, preview: `${centre} a une mise à jour de visite. Ouvrez KidEase pour la lire.` }
      : { subject: `Tour update: ${centre}`, preview: `${centre} has a tour update. Open KidEase to read it.` };
  }
  return fr
    ? { subject: `Nouveau message : ${centre}`, preview: `Vous avez un nouveau message au sujet de ${centre}. Ouvrez KidEase pour le lire.` }
    : { subject: `New message: ${centre}`, preview: `You have a new message about ${centre}. Open KidEase to read it.` };
}
