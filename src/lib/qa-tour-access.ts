/**
 * Hidden QA centre tour slots.
 * The centre stays unpublished. Only these accounts may see or book its slots.
 * A booking on this centre must not send email, SMS, or push.
 */

export const QA_TOUR_CENTRE_ID = "qa-reviewer-demo";
export const QA_TOUR_CENTRE_SLUG = "qa-reviewer-demo-centre";

const QA_TOUR_EMAILS = new Set([
  "kyle@openroadoutlet.ca",
  "klernout45@gmail.com",
  "e2e-parent@kidease.test",
  "e2e-provider@kidease.test",
  "reviewer-parent@kidease.ca",
  "reviewer-provider@kidease.ca",
  "reviewer.parent@kidease.ca",
  "reviewer.daycare@kidease.ca",
]);

export function isQaTourCentre(input: { id?: string | null; slug?: string | null }): boolean {
  const id = String(input.id || "").trim();
  const slug = String(input.slug || "").trim().toLowerCase();
  return id === QA_TOUR_CENTRE_ID || slug === QA_TOUR_CENTRE_SLUG;
}

/** Signed-in allowlist only. A guest, even with a typed email, is not allowed. */
export function qaTourEmailAllowed(email: string | null | undefined): boolean {
  const value = String(email || "").trim().toLowerCase();
  return Boolean(value) && QA_TOUR_EMAILS.has(value);
}

export type QaTourSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
};

/** Four upcoming weekday mornings. Stable ids so a second run does not duplicate them. */
export function qaTourSlotPlan(now = new Date()): QaTourSlot[] {
  const slots: QaTourSlot[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (slots.length < 4) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const date = cursor.toISOString().slice(0, 10);
      slots.push({
        id: `qa-tour-${date.replace(/-/g, "")}`,
        date,
        startTime: "10:00",
        endTime: "10:30",
        capacity: 2,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}
