/**
 * Emergency and closure notices.
 * Texts go only to people with CASL SMS consent.
 * Practice mode counts who would be reached and sends nothing.
 */

import type { EnvMap } from "../flags.ts";
import { emailPlan, modeFor, smsPlan, type PackMode } from "./mode.ts";

export const BROADCAST_FLAG = "FEATURE_GOV_BROADCAST";
export const BROADCAST_LIVE_FLAG = "FEATURE_GOV_BROADCAST_LIVE";

export type Audience =
  | { kind: "province"; province: string }
  | { kind: "city"; province: string; city: string }
  | { kind: "fsa"; province: string; fsa: string };

export function broadcastMode(env: EnvMap): PackMode {
  return modeFor(BROADCAST_FLAG, env);
}

export function normalizeFsa(postal: string): string | null {
  const compact = postal.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fsa = compact.slice(0, 3);
  return /^[A-Z][0-9][A-Z]$/.test(fsa) ? fsa : null;
}

export function centreInAudience(
  centre: { province: string; city: string; postal: string },
  audience: Audience,
): boolean {
  if (centre.province.trim().toUpperCase() !== audience.province.trim().toUpperCase()) return false;
  if (audience.kind === "province") return true;
  if (audience.kind === "city") {
    return centre.city.trim().toLowerCase() === audience.city.trim().toLowerCase();
  }
  return normalizeFsa(centre.postal) === audience.fsa.trim().toUpperCase();
}

export function parentChannelPlan(mode: PackMode, caslSms: boolean, hasEmail: boolean): {
  email: "skip" | "log" | "send";
  sms: "skip" | "log" | "send";
} {
  return { email: emailPlan(mode, hasEmail).delivery, sms: smsPlan(mode, caslSms).delivery };
}

export function daycareEmailPlan(mode: PackMode, hasEmail: boolean): "skip" | "log" | "send" {
  return emailPlan(mode, hasEmail).delivery;
}

/** A broadcast never includes a child name. The body is the notice text only. */
export function noticeBodyOk(body: string): boolean {
  const text = body.trim();
  return text.length >= 8 && text.length <= 500;
}

export function broadcastCopy(locale: "en" | "fr") {
  if (locale === "fr") {
    return {
      what: "KidEase pour votre province",
      why: "Rédigez un avis de fermeture pour les garderies et les parents touchés.",
      next: "Préparer l’avis",
      help: "Aide",
      home: "Accueil",
      off: "Cet outil est éteint. Aucun avis n’est envoyé.",
      practice: "Mode pratique : KidEase compte les envois. Rien ne part.",
      empty: "Aucun avis pour l’instant.",
    };
  }
  return {
    what: "KidEase for your province",
    why: "Write a closure notice for the daycares and parents it affects.",
    next: "Prepare the notice",
    help: "Help",
    home: "Home",
    off: "This tool is off. No notice is sent.",
    practice: "Practice mode: KidEase counts the sends. Nothing goes out.",
    empty: "No notices yet.",
  };
}
