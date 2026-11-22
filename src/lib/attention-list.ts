/** Open work derived from real records. Nothing is stored except a dismiss. */

export const ATTENTION_HISTORY_MS = 30 * 24 * 60 * 60 * 1000;

export const ATTENTION_DETAILS = [
  "tourUpdate",
  "spotOffer",
  "formDue",
  "invoiceDue",
  "paymentFailed",
  "unreadMessage",
  "unreadParent",
  "newRequest",
  "missingDoc",
  "offerWaiting",
  "overdueInvoice",
  "staffCert",
  "listingGap",
  "payrollDue",
] as const;

export type AttentionDetail = (typeof ATTENTION_DETAILS)[number];
export type AttentionRole = "parent" | "provider";

export type AttentionFact = {
  id: string;
  role: AttentionRole;
  centreId: string;
  title: string;
  detail: AttentionDetail;
  href: string;
  deadlineAt?: string | null;
  resolvedAt?: string | null;
  dismissible: boolean;
};

export type AttentionDismiss = { id: string; at: string };

export type AttentionBuckets = {
  open: AttentionFact[];
  done: AttentionFact[];
};

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function splitAttention(
  facts: readonly AttentionFact[],
  input: { now?: number; dismissed?: readonly AttentionDismiss[] } = {},
): AttentionBuckets {
  const now = input.now ?? Date.now();
  const dismissed = new Map((input.dismissed ?? []).map((row) => [row.id, time(row.at)]));
  const open: AttentionFact[] = [];
  const done: AttentionFact[] = [];
  for (const fact of facts) {
    if (!fact.centreId || !fact.title.trim()) continue;
    const resolved = time(fact.resolvedAt);
    const deadline = time(fact.deadlineAt);
    const hidden = dismissed.get(fact.id) ?? null;
    const finished = resolved ?? (deadline != null && deadline <= now ? deadline : null) ?? hidden;
    if (finished != null) {
      if (now - finished <= ATTENTION_HISTORY_MS) done.push({ ...fact, resolvedAt: new Date(finished).toISOString() });
      continue;
    }
    open.push(fact);
  }
  open.sort((a, b) => (time(a.deadlineAt) ?? Number.MAX_SAFE_INTEGER) - (time(b.deadlineAt) ?? Number.MAX_SAFE_INTEGER));
  done.sort((a, b) => (time(b.resolvedAt) ?? 0) - (time(a.resolvedAt) ?? 0));
  return { open, done };
}

export function attentionInboxHref(id: string, view: "family" | "centre", locale: "en" | "fr" = "en"): string {
  const path = locale === "fr" ? `/fr/inbox/${id}` : `/inbox/${id}`;
  return `${path}?view=${view}`;
}

export function parentAttentionFacts(input: {
  locale?: "en" | "fr";
  tours?: readonly { id: string; daycareId: string; daycareName: string; status: string; respondedAt?: string | null }[];
  offers?: readonly { id: string; daycareId: string; daycareName: string; status: string; expiresAt?: string | null; resolvedAt?: string | null }[];
  bills?: readonly { id: string; daycareId: string; daycareName: string; number: string; status: string; dueAt?: string | null; paidAt?: string | null }[];
  messages?: readonly { id: string; daycareId: string; daycareName: string; unread: boolean; readAt?: string | null }[];
  forms?: readonly { id: string; daycareId: string; daycareName: string; title: string; status: string; dueAt?: string | null; doneAt?: string | null }[];
}): AttentionFact[] {
  const facts: AttentionFact[] = [];
  for (const tour of input.tours ?? []) {
    const status = tour.status.trim().toLowerCase();
    if (status !== "accepted" && status !== "confirmed" && status !== "declined") continue;
    facts.push({
      id: `tour:${tour.id}`,
      role: "parent",
      centreId: tour.daycareId,
      title: tour.daycareName,
      detail: "tourUpdate",
      href: "/parent?tab=enrolled",
      resolvedAt: null,
      dismissible: true,
    });
  }
  for (const offer of input.offers ?? []) {
    const status = offer.status.trim().toLowerCase();
    const open = status === "open" || status === "offered";
    facts.push({
      id: `offer:${offer.id}`,
      role: "parent",
      centreId: offer.daycareId,
      title: offer.daycareName,
      detail: "spotOffer",
      href: "/parent/spot-offers",
      deadlineAt: open ? offer.expiresAt ?? null : null,
      resolvedAt: open ? null : offer.resolvedAt ?? offer.expiresAt ?? null,
      dismissible: false,
    });
  }
  for (const bill of input.bills ?? []) {
    const status = bill.status.trim().toLowerCase();
    if (status === "draft" || status === "void") continue;
    const failed = status === "failed" || status === "disputed";
    const due = status === "sent";
    if (!failed && !due && status !== "paid" && status !== "refunded") continue;
    facts.push({
      id: `bill:${bill.id}`,
      role: "parent",
      centreId: bill.daycareId,
      title: bill.daycareName || bill.number,
      detail: failed ? "paymentFailed" : "invoiceDue",
      href: `/pay/bill/${bill.id}`,
      deadlineAt: due ? bill.dueAt ?? null : null,
      resolvedAt: status === "paid" || status === "refunded" ? bill.paidAt ?? null : null,
      dismissible: false,
    });
  }
  for (const message of input.messages ?? []) {
    if (!message.unread && !message.readAt) continue;
    facts.push({
      id: `message:${message.id}`,
      role: "parent",
      centreId: message.daycareId,
      title: message.daycareName,
      detail: "unreadMessage",
      href: attentionInboxHref(message.id, "family", input.locale),
      resolvedAt: message.unread ? null : message.readAt ?? null,
      dismissible: false,
    });
  }
  for (const form of input.forms ?? []) {
    const status = form.status.trim().toLowerCase();
    const open = status === "sent" || status === "missing" || status === "requested";
    facts.push({
      id: `form:${form.id}`,
      role: "parent",
      centreId: form.daycareId,
      title: form.title || form.daycareName,
      detail: "formDue",
      href: "/parent?tab=documents",
      deadlineAt: open ? form.dueAt ?? null : null,
      resolvedAt: open ? null : form.doneAt ?? null,
      dismissible: false,
    });
  }
  return facts;
}

export function providerAttentionFacts(input: {
  now?: number;
  locale?: "en" | "fr";
  requests?: readonly { id: string; daycareId: string; title: string; status: string; respondedAt?: string | null }[];
  offers?: readonly { id: string; daycareId: string; title: string; status: string; expiresAt?: string | null; resolvedAt?: string | null }[];
  bills?: readonly { id: string; daycareId: string; title: string; status: string; dueAt?: string | null; paidAt?: string | null }[];
  messages?: readonly { id: string; daycareId: string; title: string; unread: boolean; readAt?: string | null }[];
  documents?: readonly { id: string; daycareId: string; title: string; status: string; doneAt?: string | null }[];
  certs?: readonly { id: string; daycareId: string; title: string; expiresAt: string }[];
  listingGaps?: readonly { id: string; daycareId: string; title: string; open: boolean; doneAt?: string | null }[];
}): AttentionFact[] {
  const now = input.now ?? Date.now();
  const facts: AttentionFact[] = [];
  for (const row of input.requests ?? []) {
    const status = row.status.trim().toLowerCase();
    const open = status === "requested" || status === "pending" || status === "received";
    facts.push({
      id: `request:${row.id}`,
      role: "provider",
      centreId: row.daycareId,
      title: row.title,
      detail: "newRequest",
      href: "/provider?desk=requests",
      resolvedAt: open ? null : row.respondedAt ?? null,
      dismissible: false,
    });
  }
  for (const offer of input.offers ?? []) {
    const open = offer.status.trim().toLowerCase() === "open";
    facts.push({
      id: `offer-wait:${offer.id}`,
      role: "provider",
      centreId: offer.daycareId,
      title: offer.title,
      detail: "offerWaiting",
      href: "/provider?desk=requests",
      deadlineAt: open ? offer.expiresAt ?? null : null,
      resolvedAt: open ? null : offer.resolvedAt ?? null,
      dismissible: false,
    });
  }
  for (const bill of input.bills ?? []) {
    const status = bill.status.trim().toLowerCase();
    if (status !== "sent" && status !== "paid") continue;
    const due = time(bill.dueAt);
    const overdue = status === "sent" && due != null && due <= now;
    if (status === "sent" && !overdue) continue;
    facts.push({
      id: `overdue:${bill.id}`,
      role: "provider",
      centreId: bill.daycareId,
      title: bill.title,
      detail: "overdueInvoice",
      href: "/provider?desk=money",
      resolvedAt: status === "paid" ? bill.paidAt ?? null : null,
      dismissible: false,
    });
  }
  for (const message of input.messages ?? []) {
    if (!message.unread && !message.readAt) continue;
    facts.push({
      id: `centre-message:${message.id}`,
      role: "provider",
      centreId: message.daycareId,
      title: message.title,
      detail: "unreadParent",
      href: attentionInboxHref(message.id, "centre", input.locale),
      resolvedAt: message.unread ? null : message.readAt ?? null,
      dismissible: false,
    });
  }
  for (const doc of input.documents ?? []) {
    const open = doc.status.trim().toLowerCase() === "missing";
    facts.push({
      id: `doc:${doc.id}`,
      role: "provider",
      centreId: doc.daycareId,
      title: doc.title,
      detail: "missingDoc",
      href: "/provider?desk=documents",
      resolvedAt: open ? null : doc.doneAt ?? null,
      dismissible: false,
    });
  }
  for (const cert of input.certs ?? []) {
    facts.push({
      id: `cert:${cert.id}`,
      role: "provider",
      centreId: cert.daycareId,
      title: cert.title,
      detail: "staffCert",
      href: "/provider?desk=screening",
      deadlineAt: cert.expiresAt,
      dismissible: false,
    });
  }
  for (const gap of input.listingGaps ?? []) {
    facts.push({
      id: `listing:${gap.id}`,
      role: "provider",
      centreId: gap.daycareId,
      title: gap.title,
      detail: "listingGap",
      href: "/provider?desk=listings",
      resolvedAt: gap.open ? null : gap.doneAt ?? null,
      dismissible: true,
    });
  }
  return facts;
}

export const ATTENTION_DISMISS_KEY = "ke-attention-dismiss";

export function readAttentionDismissals(raw: string | null, userId: string): AttentionDismiss[] {
  if (!raw || !userId) return [];
  try {
    const data = JSON.parse(raw) as Record<string, AttentionDismiss[]>;
    const rows = data[userId];
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && typeof row.id === "string" && typeof row.at === "string");
  } catch {
    return [];
  }
}

export function writeAttentionDismissal(raw: string | null, userId: string, id: string, at: string): string {
  const data = (() => {
    try {
      const parsed = raw ? (JSON.parse(raw) as Record<string, AttentionDismiss[]>) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();
  const current = readAttentionDismissals(JSON.stringify(data), userId).filter((row) => row.id !== id);
  data[userId] = [...current, { id, at }];
  return JSON.stringify(data);
}
