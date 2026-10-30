import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { captureAuthTokenFromResponse, getBearerToken } from "@/lib/auth/client";
import { isNative, nativePlatform } from "@/lib/native";

export const PASSKEY_OFFER_KEY = "kidease-passkey-offer";

export class PasskeyRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type SavedPasskey = {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function passkeyWasCancelled(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "NotAllowedError" || name === "AbortError") return true;
  const code = "code" in err ? String((err as { code?: string }).code) : "";
  return code === "ERROR_CEREMONY_ABORTED";
}

/**
 * Registration must show NotAllowedError. On iOS that error is what you get
 * when the tap's user gesture was lost, and hiding it makes "Turn it on" look dead.
 */
export function passkeyRegistrationError(err: unknown): string {
  if (err instanceof PasskeyRequestError && err.message.trim()) return err.message.trim();
  if (err instanceof Error) {
    const name = err.name && err.name !== "Error" ? err.name : "";
    const message = err.message.trim();
    if (name && message && !message.includes(name)) return `${message} (${name})`;
    if (message) return message;
    if (name) return name;
  }
  return "Could not turn on Face ID / fingerprint. Try again.";
}

/** iOS 1.0 hides passkeys. The WebView loses the tap before the system sheet. */
export function nativeIosSkipsPasskey(input?: { native?: boolean; platform?: "ios" | "android" | "web" }): boolean {
  const native = input?.native ?? isNative();
  const platform = input?.platform ?? nativePlatform();
  return native && platform === "ios";
}

export function webViewHasWebAuthn(): boolean {
  return typeof globalThis.PublicKeyCredential === "function";
}

/** Capacitor Android WebView often has no PublicKeyCredential. Credential Manager covers that. */
export function shouldUseAndroidCredentialManager(): boolean {
  return isNative() && nativePlatform() === "android" && !webViewHasWebAuthn();
}

export function deviceLabel(): string {
  if (typeof navigator === "undefined") return "This device";
  const platform = nativePlatform();
  if (platform === "ios") return "iPhone or iPad";
  if (platform === "android") return "Android phone";
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Mac/i.test(ua)) return "Mac";
  return "This device";
}

export function passkeyOfferSeen(): boolean {
  try {
    return window.localStorage.getItem(PASSKEY_OFFER_KEY) === "1";
  } catch {
    return true;
  }
}

export function markPasskeyOfferSeen(): void {
  try {
    window.localStorage.setItem(PASSKEY_OFFER_KEY, "1");
  } catch {
    /* private mode */
  }
}

async function authJson<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const headers = new Headers();
  if (method !== "GET") headers.set("content-type", "application/json");
  const token = getBearerToken();
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  captureAuthTokenFromResponse(res);
  const payload = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!res.ok) {
    throw new PasskeyRequestError(payload.message || "Passkey sign-in failed", payload.code || "", res.status);
  }
  return payload;
}

async function nativeCreate(requestJson: string): Promise<RegistrationResponseJSON> {
  const { PasskeyNative } = await import("@/lib/passkey-native");
  const result = await PasskeyNative.create({ requestJson });
  return JSON.parse(result.responseJson) as RegistrationResponseJSON;
}

async function nativeGet(requestJson: string): Promise<AuthenticationResponseJSON> {
  const { PasskeyNative } = await import("@/lib/passkey-native");
  const result = await PasskeyNative.get({ requestJson });
  return JSON.parse(result.responseJson) as AuthenticationResponseJSON;
}

export async function signInWithPasskey(opts?: { autofill?: boolean }): Promise<{ twoFactorSatisfied: boolean }> {
  const autofill = Boolean(opts?.autofill);
  if (autofill && shouldUseAndroidCredentialManager()) {
    throw new PasskeyRequestError("autofill", "PASSKEY_AUTOFILL_SKIP", 0);
  }
  if (autofill) {
    const browser = await import("@simplewebauthn/browser");
    if (!browser.browserSupportsWebAuthn() || !(await browser.browserSupportsWebAuthnAutofill())) {
      throw new PasskeyRequestError("autofill", "PASSKEY_AUTOFILL_SKIP", 0);
    }
  }
  const start = await authJson<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }>(
    "/api/auth/passkey/login/options",
  );
  let response: AuthenticationResponseJSON;
  if (shouldUseAndroidCredentialManager()) {
    response = await nativeGet(JSON.stringify(start.options));
  } else {
    const browser = await import("@simplewebauthn/browser");
    if (!browser.browserSupportsWebAuthn()) {
      throw new PasskeyRequestError("unsupported", "PASSKEY_UNSUPPORTED", 0);
    }
    response = await browser.startAuthentication({
      optionsJSON: start.options,
      useBrowserAutofill: autofill,
    });
  }
  return authJson<{ ok: true; twoFactorSatisfied: boolean }>("/api/auth/passkey/login/verify", {
    challengeId: start.challengeId,
    response,
  });
}

type RegisterChallenge = {
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
};

type PasskeyBrowser = typeof import("@simplewebauthn/browser");

let registerChallenge: RegisterChallenge | null = null;
let registerBrowser: PasskeyBrowser | null = null;
let registerPrefetch: Promise<void> | null = null;

/** Load the WebAuthn library and creation options before the tap. */
export function prefetchPasskeyRegistration(): void {
  if (nativeIosSkipsPasskey() || registerPrefetch) return;
  registerPrefetch = (async () => {
    try {
      if (!shouldUseAndroidCredentialManager()) {
        registerBrowser = await import("@simplewebauthn/browser");
      }
      registerChallenge = await authJson<RegisterChallenge>("/api/auth/passkey/register/options");
    } catch {
      registerChallenge = null;
      registerPrefetch = null;
    }
  })();
}

/** True when startRegistration can run in this tap, with no await before it. */
export function passkeyRegistrationReady(): boolean {
  if (!registerChallenge) return false;
  if (shouldUseAndroidCredentialManager()) return true;
  return Boolean(registerBrowser);
}

function takeRegisterChallenge(): RegisterChallenge | null {
  const start = registerChallenge;
  registerChallenge = null;
  registerPrefetch = null;
  return start;
}

export async function registerPasskey(deviceName = deviceLabel()): Promise<void> {
  const ready = takeRegisterChallenge();
  let response: RegistrationResponseJSON;
  let challengeId: string;
  if (ready && (shouldUseAndroidCredentialManager() || registerBrowser)) {
    challengeId = ready.challengeId;
    if (shouldUseAndroidCredentialManager()) {
      response = await nativeCreate(JSON.stringify(ready.options));
    } else {
      const browser = registerBrowser;
      if (!browser || !browser.browserSupportsWebAuthn()) {
        throw new PasskeyRequestError("unsupported", "PASSKEY_UNSUPPORTED", 0);
      }
      response = await browser.startRegistration({ optionsJSON: ready.options });
    }
  } else {
    const start = await authJson<RegisterChallenge>("/api/auth/passkey/register/options");
    challengeId = start.challengeId;
    if (shouldUseAndroidCredentialManager()) {
      response = await nativeCreate(JSON.stringify(start.options));
    } else {
      const browser = registerBrowser ?? (await import("@simplewebauthn/browser"));
      registerBrowser = browser;
      if (!browser.browserSupportsWebAuthn()) {
        throw new PasskeyRequestError("unsupported", "PASSKEY_UNSUPPORTED", 0);
      }
      response = await browser.startRegistration({ optionsJSON: start.options });
    }
  }
  await authJson("/api/auth/passkey/register/verify", {
    challengeId,
    deviceName,
    response,
  });
}

export async function listSavedPasskeys(): Promise<SavedPasskey[]> {
  const payload = await authJson<{ passkeys: SavedPasskey[] }>("/api/auth/passkey/list", undefined, "GET");
  return Array.isArray(payload.passkeys) ? payload.passkeys : [];
}

export async function removeSavedPasskey(id: string): Promise<void> {
  await authJson("/api/auth/passkey/delete", { id });
}

export async function shouldOfferPasskey(): Promise<boolean> {
  if (nativeIosSkipsPasskey()) return false;
  if (passkeyOfferSeen()) return false;
  if (!webViewHasWebAuthn() && !shouldUseAndroidCredentialManager()) return false;
  try {
    const rows = await listSavedPasskeys();
    if (rows.length > 0) {
      markPasskeyOfferSeen();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function cancelPasskeyCeremony(): Promise<void> {
  try {
    const browser = await import("@simplewebauthn/browser");
    browser.WebAuthnAbortService.cancelCeremony();
  } catch {
    /* library not loaded */
  }
}
