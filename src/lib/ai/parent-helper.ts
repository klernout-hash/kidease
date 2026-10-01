/**
 * Parent helper answers only from KidEase guide pages and published benefit figures.
 * It cites the page. If it does not know, it says so. It never invents a spot, fee, or licence.
 */

import { z } from "zod";
import { AB_K_FACILITY_MAX_UNDER_50K, CCB } from "../benefits-facts.ts";

export const PARENT_PAGES = [
  {
    path: "/faq",
    text: "KidEase lists licensed childcare. A fee or an open spot is shown only when that centre entered it. KidEase does not invent a spot, a fee, or a licence.",
  },
  {
    path: "/benefits",
    text: `The Canada Child Benefit maximum for a child under 6 is ${CCB.maxUnder6Year} a year for July 2026 to June 2027. The Alberta kindergarten facility-based maximum when income is under 50000 is ${AB_K_FACILITY_MAX_UNDER_50K} a month. Canada-wide $10-a-day plans are set by each province. Manitoba funded licensed child care has a maximum regulated daily fee of 10 dollars. Saskatchewan, Prince Edward Island, Newfoundland and Labrador, and Nunavut use $10-a-day at participating licensed centres. Yukon and the Northwest Territories use an average of about 10 dollars a day. British Columbia has some $10-a-Day ChildCareBC centres. Quebec uses its own reduced contribution of 9.65 dollars a day on spaces marked contribution reduite, not the same schedule. Ontario, Alberta, Nova Scotia, and New Brunswick have reduced fees that are not always 10 dollars. A $10 badge on a listing appears only when that centre's data says so. KidEase does not process the application.`,
  },
  {
    path: "/help",
    text: "You book a tour on the centre listing. Ask about the hours, ages, and fees that are already posted. KidEase does not confirm a spot.",
  },
] as const;

export const TOUR_QUESTIONS = [
  "Which ages are posted on the listing?",
  "Which hours are posted?",
  "Is a monthly fee posted, or does it say not confirmed?",
  "How do I request a tour on this listing?",
] as const;

export const parentHelperSchema = z
  .object({
    answer: z.string().min(1).max(400),
    path: z.string().min(1).max(40),
  })
  .strict();

export type ParentHelperModel = z.infer<typeof parentHelperSchema>;

export const PARENT_HELPER_UNKNOWN = "I don't know that from KidEase guides.";

export const PARENT_HELPER_SYSTEM = [
  "Answer in one or two sentences using only the guide pages.",
  "Cite one path from the pages.",
  "Do not invent a daycare, a fee, a licence, a spot, or a review.",
  "If the pages do not answer, say you do not know.",
  "Reply with JSON only: {\"answer\":\"...\",\"path\":\"/faq\"}.",
].join(" ");

export const PARENT_HELPER_EVENTS = ["parent_helper_asked", "parent_helper_unknown", "parent_helper_subsidy"] as const;

export function parentHelperEventProps(input: { path?: string } = {}) {
  const path = String(input.path || "").trim();
  if (!path.startsWith("/")) return {};
  return { path };
}

export function parentHelperModelUser(question: string): string {
  return JSON.stringify({
    question: question.replace(/\s+/g, " ").trim().slice(0, 400),
    pages: PARENT_PAGES.map((page) => ({ path: page.path, text: page.text })),
  });
}

export type ParentAnswer = {
  known: boolean;
  answer: string;
  path: string | null;
};

function pageByPath(path: string) {
  return PARENT_PAGES.find((page) => page.path === path);
}

function allowedNumbers(text: string): Set<string> {
  return new Set(text.match(/\d+/g) || []);
}

export function groundParentAnswer(model: ParentHelperModel | null): ParentAnswer {
  const unknown: ParentAnswer = { known: false, answer: PARENT_HELPER_UNKNOWN, path: null };
  if (!model) return unknown;
  const page = pageByPath(model.path.trim());
  if (!page) return unknown;
  const answer = model.answer.replace(/\s+/g, " ").trim();
  if (!answer || answer.length > 400 || /@/.test(answer)) return unknown;
  if (/\b(licence number|license number)\b/i.test(answer)) return unknown;
  const nums = answer.match(/\d+/g) || [];
  const allowed = allowedNumbers(`${page.text} ${page.path}`);
  if (nums.some((n) => !allowed.has(n))) return unknown;
  return { known: true, answer, path: page.path };
}

export type SubsidyEstimate =
  | { known: true; path: "/benefits"; amount: number; label: string }
  | { known: false; path: "/benefits"; label: string };

/** Only figures already published on KidEase. Anything else is unknown. */
export function subsidyEstimate(province: string): SubsidyEstimate {
  const code = province.trim().toUpperCase();
  if (code === "AB") {
    return {
      known: true,
      path: "/benefits",
      amount: AB_K_FACILITY_MAX_UNDER_50K,
      label: "Alberta kindergarten facility-based maximum when income is under $50,000.",
    };
  }
  if (code === "CA") {
    return {
      known: true,
      path: "/benefits",
      amount: CCB.maxUnder6Year,
      label: "Canada Child Benefit maximum for a child under 6, July 2026 to June 2027.",
    };
  }
  if (code === "MB") {
    return {
      known: true,
      path: "/benefits",
      amount: 10,
      label: "Manitoba maximum regulated daily fee at funded licensed centres is $10 a day.",
    };
  }
  return { known: false, path: "/benefits", label: "KidEase does not publish a subsidy figure for that province." };
}
