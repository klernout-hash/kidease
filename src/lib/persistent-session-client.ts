import { registerPlugin } from "@capacitor/core";
import { isNative, isStandalone } from "@/lib/native";
import { pushActionFor } from "@/lib/persistent-session";

const REFRESH_KEY = "refresh";
const STEP_KEY = "stepup";
const PENDING_KEY = "ke-persistent-enroll";
const RELOAD_KEY = "ke-ps-reloaded";

type SecureBridge = {
  set(options: { key: string; value: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value?: string | null }>;
  remove(options: { key: string }): Promise<void>;
  biometricAvailable(): Promise<{ available?: boolean }>;
};

const SecureSession = registerPlugin<SecureBridge>("SecureSession");

let resumeBound = false;
let booting: Promise<void> | null = null;

export async function persistentSessionsOn(): Promise<boolean> {
  try {
    const { persistentSessionStatus } = await import("@/lib/server/persistent-session");
    const status = await persistentSessionStatus();
    return status.enabled === true;
  } catch {
    return false;
  }
}

async function secureGet(key: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const result = await SecureSession.get({ key });
    const value = String(result?.value || "").trim();
    return value || null;
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await SecureSession.set({ key, value });
    return true;
  } catch {
    return false;
  }
}

async function secureRemove(key: string): Promise<void> {
  if (!isNative()) return;
  try {
    await SecureSession.remove({ key });
  } catch {
    /* old binaries have no keychain plugin */
  }
}

export async function biometricStepUpAvailable(): Promise<boolean> {
  if (!isNative() || !(await persistentSessionsOn())) return false;
  try {
    const result = await SecureSession.biometricAvailable();
    return result?.available === true;
  } catch {
    return false;
  }
}

export async function confirmBiometricStepUp(): Promise<boolean> {
  const secret = await secureGet(STEP_KEY);
  if (!secret) return false;
  const { confirmPersistentBiometric } = await import("@/lib/server/persistent-session");
  const result = await confirmPersistentBiometric({ data: { secret } });
  if (!result.ok || !("stepUpSecret" in result) || !result.stepUpSecret) return false;
  await secureSet(STEP_KEY, result.stepUpSecret);
  return true;
}

async function storedPushToken(): Promise<string> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const saved = await Preferences.get({ key: "ke-push-token" });
    return String(saved.value || "").trim();
  } catch {
    return "";
  }
}

export async function enrollAfterSignIn(input: { remember: boolean; shell: boolean }): Promise<void> {
  if (!(await persistentSessionsOn())) return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
  const { issuePersistentSession } = await import("@/lib/server/persistent-session");
  const bio = input.shell ? await biometricStepUpAvailable() : false;
  const result = await issuePersistentSession({
    data: {
      remember: input.remember,
      shell: input.shell,
      biometric: bio,
      pushToken: input.shell ? await storedPushToken() : "",
    },
  });
  if (!result.ok) return;
  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `kidease-persistent=1; Path=/; Max-Age=34560000; SameSite=Lax${secure}`;
  }
  if (result.refreshToken) await secureSet(REFRESH_KEY, result.refreshToken);
  if (result.stepUpSecret) await secureSet(STEP_KEY, result.stepUpSecret);
}

export function markPendingEnroll(input: { remember: boolean; shell: boolean }): void {
  try {
    sessionStorage.setItem(PENDING_KEY, input.shell ? "shell" : input.remember ? "1" : "0");
  } catch {
    /* ignore */
  }
}

async function reregisterPush(): Promise<void> {
  if (pushActionFor("resume") !== "reregister") return;
  try {
    const { reregisterStoredPush } = await import("@/lib/push-client");
    const token = await reregisterStoredPush();
    if (!token) return;
    const { touchPersistentPush } = await import("@/lib/server/persistent-session");
    await touchPersistentPush({ data: { token } });
  } catch {
    /* push stays as it was */
  }
}

let refreshing: Promise<void> | null = null;

/**
 * One refresh at a time. Boot and the resume listener used to rotate in
 * parallel with the same secret. The loser's secret became previous_hash, and
 * presenting it again after the 2-minute grace revoked the whole session.
 */
function refreshShell(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = refreshShellOnce().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refreshShellOnce(): Promise<void> {
  const token = await secureGet(REFRESH_KEY);
  const { refreshPersistentSession } = await import("@/lib/server/persistent-session");
  const result = await refreshPersistentSession({ data: { refreshToken: token || "" } });
  if (!result.ok) {
    if (!result.skipped) await secureRemove(REFRESH_KEY);
    return;
  }
  if (result.refreshToken) await secureSet(REFRESH_KEY, result.refreshToken);
  if (pushActionFor("refresh") !== "keep") return;
  await reregisterPush();
  if (result.revived) {
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
      sessionStorage.setItem(RELOAD_KEY, "1");
    } catch {
      return;
    }
    window.location.reload();
  } else {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
  }
}

function shellHere(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative() || isStandalone()) return true;
  return /KidEaseStoreMicrosoft|ke_store=microsoft/.test(document.cookie + navigator.userAgent);
}

export async function bootPersistentSession(): Promise<void> {
  if (booting) return booting;
  booting = (async () => {
    if (!(await persistentSessionsOn())) {
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const path = window.location.pathname;
    if (path.startsWith("/admin") || path.startsWith("/fr/admin") || path.startsWith("/gov")) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_KEY);
    } catch {
      pending = null;
    }
    if (pending === "0" || pending === "1" || pending === "shell") {
      const { authClient } = await import("@/lib/auth/client");
      const session = await authClient.getSession().catch(() => null);
      if (session?.data?.user) {
        await enrollAfterSignIn({
          remember: pending === "1" || pending === "shell",
          shell: pending === "shell" || shellHere(),
        });
      }
    }
    if (!shellHere()) return;
    await refreshShell();
    const { authClient } = await import("@/lib/auth/client");
    const session = await authClient.getSession().catch(() => null);
    const stored = await secureGet(REFRESH_KEY);
    if (session?.data?.user && !stored) {
      await enrollAfterSignIn({ remember: true, shell: true });
    }
    await reregisterPush();
    if (resumeBound || !isNative()) return;
    resumeBound = true;
    const { App } = await import("@capacitor/app");
    await App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void refreshShell();
    });
  })().finally(() => {
    booting = null;
  });
  return booting;
}

/** Sign-out drops this phone's refresh secret and asks the server to drop the push token. */
export async function endPersistentSession(): Promise<void> {
  const marked = typeof document !== "undefined" && /(?:^|; )kidease-persistent=1(?:;|$)/.test(document.cookie);
  if (!isNative() && !marked) return;
  // N-34: drop the Keychain / Keystore tokens first. Sign out only waits a
  // moment for this step, and a slow or blocked server call used to leave the
  // refresh token behind, so the next launch signed the person back in.
  await secureRemove(REFRESH_KEY);
  await secureRemove(STEP_KEY);
  if (typeof document !== "undefined") {
    document.cookie = "kidease-persistent=; Path=/; Max-Age=0; SameSite=Lax";
  }
  try {
    const { revokePersistentDevice } = await import("@/lib/server/persistent-session");
    await revokePersistentDevice({ data: { current: true } });
  } catch {
    /* the session may already be gone */
  }
}
