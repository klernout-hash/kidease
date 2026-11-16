/**
 * This-device memory for first-run, plus a push to the signed-in account.
 * Replay does not clear "seen", so a tour does not auto-open again.
 */
import { useSyncExternalStore } from "react";
import {
  EMPTY_ONBOARDING,
  ONBOARDING_STORAGE_KEY,
  markDismissed,
  markSeen,
  mergeOnboarding,
  parseOnboardingState,
  reopenChecklist,
  serializeOnboardingState,
  type OnboardingState,
} from "@/lib/first-run";
import { getOnboardingProgress, readFirstRunEnabled, saveOnboardingProgress } from "@/lib/server/first-run";

export const REPLAY_EVENT = "kidease-first-run-replay";
const FORCE_KEY = "kidease-force-checklist";
const REPLAY_FORCE_KEY = "kidease-force-replay";

/** Survives the navigation a replay uses to reach its own page. */
export function stashReplay(key: string) {
  try {
    window.sessionStorage.setItem(REPLAY_FORCE_KEY, key);
  } catch {
    /* private mode */
  }
}

export function peekStashedReplay(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(REPLAY_FORCE_KEY);
  } catch {
    return null;
  }
}

export function clearStashedReplay() {
  try {
    window.sessionStorage.removeItem(REPLAY_FORCE_KEY);
  } catch {
    /* private mode */
  }
}

export function forceChecklist(key: string) {
  rememberReopen(key);
  try {
    window.sessionStorage.setItem(FORCE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function forcedChecklist(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(FORCE_KEY);
  } catch {
    return null;
  }
}

export function clearForcedChecklist() {
  try {
    window.sessionStorage.removeItem(FORCE_KEY);
  } catch {
    /* ignore */
  }
}

let state: OnboardingState = EMPTY_ONBOARDING;
let hydrated = false;
const listeners = new Set<() => void>();

let flag: boolean | null = null;
let flagTask: Promise<boolean> | null = null;
const flagListeners = new Set<() => void>();

let signedIn = false;

function emit() {
  for (const listener of listeners) listener();
}

function emitFlag() {
  for (const listener of flagListeners) listener();
}

export function hydrateOnboarding() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    state = parseOnboardingState(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
  } catch {
    state = EMPTY_ONBOARDING;
  }
  emit();
}

function writeLocal(next: OnboardingState) {
  state = next;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, serializeOnboardingState(next));
  } catch {
    /* private mode */
  }
  emit();
}

function snapshot(): OnboardingState {
  return state;
}

export function useOnboardingState(): OnboardingState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    () => EMPTY_ONBOARDING,
  );
}

export function useFirstRunFlag(): boolean | null {
  return useSyncExternalStore(
    (listener) => {
      flagListeners.add(listener);
      return () => flagListeners.delete(listener);
    },
    () => flag,
    () => null,
  );
}

export function loadFirstRunFlag(): Promise<boolean> {
  if (!flagTask) {
    flagTask = readFirstRunEnabled()
      .then((value) => {
        flag = value === true;
        emitFlag();
        return flag;
      })
      .catch(() => {
        flag = false;
        emitFlag();
        return false;
      });
  }
  return flagTask;
}

export function setOnboardingSignedIn(value: boolean) {
  signedIn = value;
}

async function push(key: string, action: "seen" | "dismiss" | "reopen") {
  if (!signedIn || flag !== true) return;
  try {
    await saveOnboardingProgress({ data: { key, action } });
  } catch {
    /* local memory still holds the choice */
  }
}

export function rememberSeen(key: string) {
  hydrateOnboarding();
  writeLocal(markSeen(state, key));
  void push(key, "seen");
}

export function rememberDismissed(key: string) {
  hydrateOnboarding();
  writeLocal(markDismissed(state, key));
  void push(key, "dismiss");
}

export function rememberReopen(key: string) {
  hydrateOnboarding();
  writeLocal(reopenChecklist(state, key));
  void push(key, "reopen");
}

export async function pullOnboarding(): Promise<void> {
  if (!signedIn || flag !== true) return;
  try {
    const remote = await getOnboardingProgress();
    const local = state;
    const merged = mergeOnboarding(local, remote);
    const forced = forcedChecklist();
    if (forced) merged.dismissed = merged.dismissed.filter((key) => key !== forced);
    writeLocal(merged);
    if (forced && remote.dismissed.includes(forced)) void push(forced, "reopen");
    for (const key of merged.seen) {
      if (!remote.seen.includes(key)) void push(key, "seen");
    }
    for (const key of merged.dismissed) {
      if (!remote.dismissed.includes(key)) void push(key, "dismiss");
    }
  } catch {
    /* keep this device */
  }
}

export function requestReplay(key: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: key }));
}
