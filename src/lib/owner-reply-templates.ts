/**
 * Request replies a centre can drop into a message and edit before sending.
 * Picking one never sends. Owners can change their own wording in English or French.
 */

export type OwnerReplyTemplate = {
  id: string;
  title: string;
  body: string;
};

const EN: OwnerReplyTemplate[] = [
  { id: "tour-confirmed", title: "Tour confirmed", body: "Your tour is confirmed. Reply here if you need a different time." },
  { id: "waitlist-added", title: "Waitlist added", body: "You are on our waitlist. This is not a guaranteed spot. We will write here if one opens." },
  { id: "spot-offered", title: "Spot offered", body: "We can offer a spot. Reply here if you want to talk about a start date." },
  { id: "not-a-fit", title: "Not a fit right now", body: "Thank you for writing. We are not able to offer a spot right now. You are welcome to write again if your dates change." },
];

const FR: OwnerReplyTemplate[] = [
  { id: "tour-confirmed", title: "Visite confirmée", body: "Votre visite est confirmée. Répondez ici si vous avez besoin d'une autre heure." },
  { id: "waitlist-added", title: "Ajouté à la liste d'attente", body: "Vous êtes sur notre liste d'attente. Ce n'est pas une place garantie. Nous écrirons ici si une place s'ouvre." },
  { id: "spot-offered", title: "Place offerte", body: "Nous pouvons offrir une place. Répondez ici si vous voulez parler d'une date de début." },
  { id: "not-a-fit", title: "Pas le bon choix pour le moment", body: "Merci d'avoir écrit. Nous ne pouvons pas offrir de place pour le moment. Vous pouvez écrire de nouveau si vos dates changent." },
];

export function defaultOwnerTemplates(locale: "en" | "fr"): OwnerReplyTemplate[] {
  return (locale === "fr" ? FR : EN).map((row) => ({ ...row }));
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function parseOwnerTemplate(value: unknown): OwnerReplyTemplate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; title?: unknown; body?: unknown };
  const id = clean(String(row.id || ""), 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const title = clean(String(row.title || ""), 80);
  const body = String(row.body || "").replace(/\r/g, "").trim().slice(0, 800);
  if (!id || !title || !body) return null;
  return { id, title, body };
}

/** Centre edits replace a default with the same id. A blank body removes that reply. */
export function mergeOwnerTemplates(
  locale: "en" | "fr",
  overrides: readonly unknown[],
): OwnerReplyTemplate[] {
  const removed = new Set<string>();
  const edited = new Map<string, OwnerReplyTemplate>();
  for (const raw of overrides) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { id?: unknown; title?: unknown; body?: unknown };
    const id = clean(String(row.id || ""), 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!id) continue;
    const body = String(row.body || "").replace(/\r/g, "").trim().slice(0, 800);
    if (!body) {
      removed.add(id);
      continue;
    }
    const parsed = parseOwnerTemplate(raw);
    if (parsed) edited.set(parsed.id, parsed);
  }
  const defaults = defaultOwnerTemplates(locale).filter((row) => !removed.has(row.id));
  const merged = defaults.map((row) => edited.get(row.id) ?? row);
  for (const [id, row] of edited) {
    if (!defaults.some((item) => item.id === id) && !removed.has(id)) merged.push(row);
  }
  return merged.slice(0, 12);
}
