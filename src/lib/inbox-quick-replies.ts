/**
 * Centre inbox quick replies (Sprint 2a).
 * Insert into the composer only — never auto-send, never enrollment-binding.
 * Ops set only: no marketing templates, no secrets in bodies or previews.
 */

import { containsInboxSecret, maskInboxPreview } from "./inbox-secrets.ts";

export const QUICK_REPLY_PLACEHOLDERS = [
  "{parent_name}",
  "{child_age}",
  "{tour_datetime}",
  "{centre_name}",
] as const;

export type QuickReplyId =
  | "confirm"
  | "what_to_bring"
  | "subsidy_faq"
  | "age_availability"
  | "reschedule"
  | "soft_decline"
  | "post_tour"
  | "waitlist";

export type QuickReplyTemplate = {
  id: QuickReplyId;
  /** e.g. "All rooms · sent when tour confirmed" */
  meta: string;
  title: string;
  body: string;
};

export const QUICK_REPLY_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: "confirm",
    meta: "All rooms · sent when tour confirmed",
    title: "Confirm tour",
    body: "Hi {parent_name} — you’re confirmed for a tour at {centre_name} on {tour_datetime}. Reply here if you need to change it.",
  },
  {
    id: "what_to_bring",
    meta: "All rooms · sent before a booked tour",
    title: "What to bring",
    body: "Hi {parent_name} — for the {tour_datetime} tour at {centre_name}, please bring indoor shoes and any questions about {child_age}. We’ll meet you at the front desk.",
  },
  {
    id: "subsidy_faq",
    meta: "All rooms · sent after inquiry",
    title: "Subsidy FAQ",
    body: "Hi {parent_name} — {centre_name} can talk through provincial fee subsidy and $10-a-day on the tour. We don’t process applications on KidEase; we’ll point you to the official site.",
  },
  {
    id: "age_availability",
    meta: "All rooms · sent when asked about a space",
    title: "Age availability",
    body: "Hi {parent_name} — thanks for asking about a space for {child_age} at {centre_name}. I’ll confirm the current opening for that age band and reply here.",
  },
  {
    id: "reschedule",
    meta: "All rooms · sent when proposing a new time",
    title: "Reschedule",
    body: "Hi {parent_name} — {tour_datetime} no longer works on our side. Could {centre_name} offer a new time? Reply with a couple of windows that suit you.",
  },
  {
    id: "soft_decline",
    meta: "All rooms · sent when the tour cannot work",
    title: "Soft decline",
    body: "Hi {parent_name} — thank you for considering {centre_name}. We can’t offer a tour for {child_age} right now. You’re welcome to write back if your dates change.",
  },
  {
    id: "post_tour",
    meta: "All rooms · sent after a completed tour",
    title: "Post-tour follow-up",
    body: "Hi {parent_name} — it was good to meet you at {centre_name} on {tour_datetime}. Reply here if you have follow-up questions about a space for {child_age}.",
  },
  {
    id: "waitlist",
    meta: "All rooms · sent when a family joins the waitlist",
    title: "Waitlist",
    body: "Hi {parent_name} — we’ve noted {child_age} on the {centre_name} waitlist. This is not a ranked public list. We’ll message you here if a spot opens.",
  },
];

export type QuickReplyVars = {
  parent_name?: string | null;
  child_age?: string | null;
  tour_datetime?: string | null;
  centre_name?: string | null;
};

export function fillQuickReply(body: string, vars: QuickReplyVars): string {
  return body
    .replaceAll("{parent_name}", (vars.parent_name || "").trim() || "there")
    .replaceAll("{child_age}", (vars.child_age || "").trim() || "your child")
    .replaceAll("{tour_datetime}", (vars.tour_datetime || "").trim() || "the tour time")
    .replaceAll("{centre_name}", (vars.centre_name || "").trim() || "our centre");
}

export function quickReplyPreview(template: QuickReplyTemplate, vars: QuickReplyVars = {}): string {
  return maskInboxPreview(fillQuickReply(template.body, vars));
}

export function opsQuickReplies(): QuickReplyTemplate[] {
  return QUICK_REPLY_TEMPLATES.filter((row) => !containsInboxSecret(row.body) && !containsInboxSecret(row.meta));
}
