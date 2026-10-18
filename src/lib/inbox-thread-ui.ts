/**
 * Pure inbox presentation: filters, status lines, day separators, read receipts.
 * No database. scripts/inbox-thread-ui.test.mjs loads this in Node.
 */

import type { BookingStatus, TourStatus } from "./types.ts";

export const MESSAGE_FILTERS = ["all", "unread", "requests", "archived"] as const;
export type MessageFilter = (typeof MESSAGE_FILTERS)[number];

export type InboxRead = {
  userId: string;
  name: string;
  lastReadAt: string;
};

export type InboxParticipantRole = "parent" | "owner" | "staff";

export type InboxParticipant = {
  id: string;
  name: string;
  image: string | null;
  role: InboxParticipantRole;
};

export type InboxStatusKey =
  | "inboxStatusEnrolled"
  | "inboxStatusTourBooked"
  | "inboxStatusWaitlist"
  | "inboxStatusRequestPending"
  | "inboxStatusTourRequested";

export type ConversationDetails = {
  conversationId: string;
  viewerRole: "parent" | "centre" | "admin" | "none";
  daycareName: string;
  daycareSlug: string;
  photo: string;
  childName: string | null;
  status: BookingStatus | null;
  tourStatus: string | null;
  startDate: string | null;
  preferredTimes: Array<{ date: string; time: string }>;
  participants: InboxParticipant[];
  reads: InboxRead[];
  starred: boolean;
  archived: boolean;
  markedUnread: boolean;
};

export type InboxListRow = {
  id: string;
  parentName: string;
  preview: string;
  daycareName: string;
  unread: boolean;
  archived?: boolean;
  status?: BookingStatus | string | null;
  tourStatus?: TourStatus | string | null;
  stage?: string | null;
  centreName?: string | null;
  memberNames?: string | null;
  childName?: string | null;
};

const REQUEST_BOOKING = new Set(["requested", "under_review"]);
const ENROLLED_BOOKING = new Set(["accepted", "active"]);

export function parseMessageFilter(raw: unknown): MessageFilter {
  const value = typeof raw === "string" ? raw : "";
  return (MESSAGE_FILTERS as readonly string[]).includes(value) ? (value as MessageFilter) : "all";
}

export function messageFilterCopyKey(filter: MessageFilter, role: "family" | "centre") {
  if (filter === "unread") return "inboxFilterUnread" as const;
  if (filter === "archived") return "inboxFilterArchived" as const;
  if (filter === "requests") return role === "centre" ? ("inboxFilterInquiries" as const) : ("inboxFilterRequests" as const);
  return "inboxFilterAll" as const;
}

export function isInboxRequest(row: Pick<InboxListRow, "status" | "tourStatus" | "stage">): boolean {
  const booking = String(row.status || "").toLowerCase();
  const tour = String(row.tourStatus || "").toLowerCase();
  const stage = String(row.stage || "");
  if (REQUEST_BOOKING.has(booking)) return true;
  if (tour === "pending") return true;
  if (stage === "new_inquiry" || stage === "tour_requested") return true;
  return false;
}

export function filterInboxList<T extends InboxListRow>(
  rows: T[],
  input: { filter: MessageFilter; query?: string },
): T[] {
  const query = (input.query || "").trim().toLowerCase();
  return rows.filter((row) => {
    if (query) {
      const hay = [row.parentName, row.preview, row.daycareName, row.centreName, row.memberNames, row.childName]
        .map((part) => (part || "").toLowerCase())
        .join("\n");
      if (!hay.includes(query)) return false;
    }
    const archived = Boolean(row.archived);
    if (input.filter === "archived") return archived;
    if (archived) return false;
    if (input.filter === "unread") return row.unread;
    if (input.filter === "requests") return isInboxRequest(row);
    return true;
  });
}

/** Green when care is confirmed. Pending stays a quieter dot so it is not "all set". */
export function inboxStatusLine(input: {
  status?: string | null;
  tourStatus?: string | null;
}): { key: InboxStatusKey; dot: "ok" | "wait" } | null {
  const booking = String(input.status || "").toLowerCase();
  const tour = String(input.tourStatus || "").toLowerCase();
  if (ENROLLED_BOOKING.has(booking) || tour === "enrolled") return { key: "inboxStatusEnrolled", dot: "ok" };
  if (tour === "accepted" || tour === "completed") return { key: "inboxStatusTourBooked", dot: "ok" };
  if (booking === "waitlist") return { key: "inboxStatusWaitlist", dot: "wait" };
  if (tour === "pending") return { key: "inboxStatusTourRequested", dot: "wait" };
  if (REQUEST_BOOKING.has(booking)) return { key: "inboxStatusRequestPending", dot: "wait" };
  return null;
}

export function lastMessageFromViewer(viewerIsParent: boolean, sender: string | null | undefined): boolean {
  if (!sender || sender === "system") return false;
  return viewerIsParent ? sender === "parent" : sender === "provider";
}

export function withYouPrefix(fromYou: boolean, body: string, prefix: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (!fromYou) return text;
  const lead = prefix.trim().toLowerCase();
  if (text.toLowerCase().startsWith(lead)) return text;
  return `${prefix}${text}`;
}

export function inboxTimeLabel(iso: string, now = new Date(), locale = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const loc = locale === "fr" ? "fr-CA" : "en-CA";
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(loc, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function messageClock(iso: string, locale = "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale === "fr" ? "fr-CA" : "en-CA", { hour: "numeric", minute: "2-digit" });
}

export function messageDayLabel(
  iso: string,
  now = new Date(),
  locale = "en",
): { today: boolean; yesterday: boolean; text: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { today: false, yesterday: false, text: "" };
  const start = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  const text = d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
  return { today: diff === 0, yesterday: diff === 1, text };
}

export function formatStayDate(iso: string | null | undefined, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "short", day: "numeric" });
}

export function readByNames(reads: InboxRead[], messageAt: string, viewerId: string): string[] {
  const at = new Date(messageAt).getTime();
  if (Number.isNaN(at)) return [];
  const names: string[] = [];
  for (const read of reads) {
    if (!read.userId || read.userId === viewerId) continue;
    const when = new Date(read.lastReadAt).getTime();
    if (Number.isNaN(when) || when < at) continue;
    const name = (read.name || "").trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function joinNames(names: string[], andWord: string): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} ${andWord} ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} ${andWord} ${clean[clean.length - 1]}`;
}

export function participantInitials(name: string | null | undefined): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
  return letters || "?";
}

export function rowTitle(input: { viewerIsParent: boolean; memberNames?: string | null; centreName?: string | null; parentName?: string | null }): string {
  if (input.viewerIsParent) return (input.memberNames || input.centreName || "").trim();
  return (input.parentName || "").trim();
}
