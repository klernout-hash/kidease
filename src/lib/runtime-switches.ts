/**
 * Runtime kill switches. Unset means the feature stays on.
 * Set the env value to 0 to pause it. Read on each request.
 * PostHog does not override these. A code deploy is not required.
 */

import type { EnvMap } from "./flags.ts";

export const RUNTIME_SWITCH_KEYS = [
  "FEATURE_PUBLIC_MAP",
  "FEATURE_INBOX",
  "FEATURE_TOUR_BOOKING",
  "FEATURE_WAITLIST_SPOTS",
  "FEATURE_CLAIM_LISTING",
  "FEATURE_VACANCY_INDEX",
  "FEATURE_JOB_INTEREST",
] as const;

export type RuntimeSwitchKey = (typeof RUNTIME_SWITCH_KEYS)[number];

export type RuntimeSwitches = {
  publicMap: boolean;
  inbox: boolean;
  tourBooking: boolean;
  waitlistSpots: boolean;
  claimListing: boolean;
  vacancyIndex: boolean;
  jobInterest: boolean;
};

const SWITCH_ID: Record<keyof RuntimeSwitches, RuntimeSwitchKey> = {
  publicMap: "FEATURE_PUBLIC_MAP",
  inbox: "FEATURE_INBOX",
  tourBooking: "FEATURE_TOUR_BOOKING",
  waitlistSpots: "FEATURE_WAITLIST_SPOTS",
  claimListing: "FEATURE_CLAIM_LISTING",
  vacancyIndex: "FEATURE_VACANCY_INDEX",
  jobInterest: "FEATURE_JOB_INTEREST",
};

const COPY: Record<RuntimeSwitchKey, { en: { title: string; body: string }; fr: { title: string; body: string } }> = {
  FEATURE_PUBLIC_MAP: {
    en: { title: "The map is off for now", body: "You can still use the list." },
    fr: { title: "La carte est éteinte pour le moment", body: "Vous pouvez encore utiliser la liste." },
  },
  FEATURE_INBOX: {
    en: { title: "Messages are off for now", body: "You can still search for care." },
    fr: { title: "Les messages sont éteints pour le moment", body: "Vous pouvez encore chercher une place." },
  },
  FEATURE_TOUR_BOOKING: {
    en: { title: "Tour requests are off for now", body: "You can still open the listing." },
    fr: { title: "Les demandes de visite sont éteintes pour le moment", body: "Vous pouvez encore ouvrir la fiche." },
  },
  FEATURE_WAITLIST_SPOTS: {
    en: { title: "Waitlists and spot offers are off for now", body: "You can still search for care." },
    fr: { title: "Les listes d’attente et les offres de place sont éteintes pour le moment", body: "Vous pouvez encore chercher une place." },
  },
  FEATURE_CLAIM_LISTING: {
    en: { title: "Claiming a listing is off for now", body: "Search still works." },
    fr: { title: "La revendication d’une fiche est éteinte pour le moment", body: "La recherche fonctionne encore." },
  },
  FEATURE_VACANCY_INDEX: {
    en: { title: "The open-spot index is off for now", body: "Search still works." },
    fr: { title: "L’index des places ouvertes est éteint pour le moment", body: "La recherche fonctionne encore." },
  },
  FEATURE_JOB_INTEREST: {
    en: { title: "The job interest form is off for now", body: "You can still look up a daycare." },
    fr: { title: "Le formulaire d’intérêt pour les emplois est éteint pour le moment", body: "Vous pouvez encore chercher une garderie." },
  },
};

function readEnv(env?: EnvMap): EnvMap {
  if (env) return env;
  if (typeof process !== "undefined" && process.env) return process.env as EnvMap;
  return {};
}

/** True unless the env value is 0, false, off, or no. Unset stays on. */
export function runtimeSwitchOn(key: RuntimeSwitchKey, env?: EnvMap): boolean {
  const raw = readEnv(env)[key];
  if (raw == null || String(raw).trim() === "") return true;
  const value = String(raw).trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off" && value !== "no";
}

export function runtimeSwitchSnapshot(env?: EnvMap): RuntimeSwitches {
  return {
    publicMap: runtimeSwitchOn("FEATURE_PUBLIC_MAP", env),
    inbox: runtimeSwitchOn("FEATURE_INBOX", env),
    tourBooking: runtimeSwitchOn("FEATURE_TOUR_BOOKING", env),
    waitlistSpots: runtimeSwitchOn("FEATURE_WAITLIST_SPOTS", env),
    claimListing: runtimeSwitchOn("FEATURE_CLAIM_LISTING", env),
    vacancyIndex: runtimeSwitchOn("FEATURE_VACANCY_INDEX", env),
    jobInterest: runtimeSwitchOn("FEATURE_JOB_INTEREST", env),
  };
}

export function runtimeSwitchKey(id: keyof RuntimeSwitches): RuntimeSwitchKey {
  return SWITCH_ID[id];
}

export function runtimeSwitchCopy(key: RuntimeSwitchKey, locale: string): { title: string; body: string } {
  const pack = COPY[key];
  return locale === "fr" ? pack.fr : pack.en;
}

export function assertRuntimeSwitch(key: RuntimeSwitchKey, env?: EnvMap): void {
  if (runtimeSwitchOn(key, env)) return;
  throw new Error(runtimeSwitchCopy(key, "en").body);
}
