/**
 * Win-back, age milestones, and per-category email or SMS choices.
 * FEATURE_LIFECYCLE defaults off. SMS never sends without CASL consent.
 * Push is not part of this file.
 */

export const LIFECYCLE_FLAG = "FEATURE_LIFECYCLE";
export const WINBACK_IDLE_DAYS = 45;
export const MILESTONE_MONTHS = [12, 18, 30, 72] as const;

export const NOTICE_CATEGORIES = ["tours", "messages", "spots", "account", "tips"] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

export type LifecycleEnv = Record<string, string | undefined>;

function flagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function lifecycleEnabled(env?: LifecycleEnv): boolean {
  const bag = env ?? (typeof process !== "undefined" ? process.env : {});
  return flagOn(bag[LIFECYCLE_FLAG]) || flagOn(bag[`VITE_${LIFECYCLE_FLAG}`]);
}

export type NoticeChoice = {
  email: boolean;
  sms: boolean;
};

export type NoticePrefs = Record<NoticeCategory, NoticeChoice> & { unsubscribedAll: boolean };

export function defaultNoticePrefs(): NoticePrefs {
  return {
    tours: { email: true, sms: false },
    messages: { email: true, sms: false },
    spots: { email: true, sms: false },
    account: { email: true, sms: false },
    tips: { email: false, sms: false },
    unsubscribedAll: false,
  };
}

/** Tips are commercial. Account email stays unless the parent unsubscribed everything. */
export function noticeAllowed(input: {
  enabled: boolean;
  category: NoticeCategory;
  channel: "email" | "sms";
  prefs: NoticePrefs;
  emailConsent: boolean;
  smsConsent: boolean;
  smsFlag: boolean;
}): boolean {
  if (!input.enabled) return false;
  if (input.prefs.unsubscribedAll) return false;
  if (input.category === "tips" && input.channel === "sms") return false;
  const choice = input.prefs[input.category];
  if (!choice[input.channel]) return false;
  if (input.channel === "sms") return input.smsFlag && input.smsConsent;
  if (input.category === "tips") return input.emailConsent;
  if (input.category === "account") return true;
  return true;
}

/** Inactive parents get one email, and only with commercial consent. Never SMS. */
export function winBackChannel(input: {
  enabled: boolean;
  lastSeen: string;
  now: Date;
  emailConsent: boolean;
  unsubscribedAll: boolean;
}): "email" | "none" {
  if (!input.enabled || !input.emailConsent || input.unsubscribedAll) return "none";
  const seen = new Date(input.lastSeen);
  if (Number.isNaN(seen.getTime())) return "none";
  const idle = input.now.getTime() - seen.getTime();
  if (idle < WINBACK_IDLE_DAYS * 24 * 60 * 60 * 1000) return "none";
  return "email";
}

/** The next age band the parent has not been told about. Does not claim a spot. */
export function nextMilestone(ageMonths: number, alreadySent: readonly number[]): number | null {
  if (!Number.isFinite(ageMonths) || ageMonths < 0) return null;
  for (const month of MILESTONE_MONTHS) {
    if (ageMonths >= month && !alreadySent.includes(month)) return month;
  }
  return null;
}

export function milestoneCopy(month: number, locale: "en" | "fr"): string {
  if (locale === "fr") {
    return `Votre enfant a atteint ${month} mois. Vous pouvez chercher à nouveau pour ce groupe d’âge. Cela n’indique pas une place libre.`;
  }
  return `Your child reached ${month} months. You can search again for this age group. This does not mean a spot is open.`;
}
