/**
 * Client-side handling for Admin Waiting / Incomplete centre loads.
 * Auth and runtime failures must not look like an empty queue.
 */

export const ADMIN_IDLE_TIMEOUT_MESSAGE = "Admin session timed out. Sign in again.";
export const ADMIN_CENTRES_LOAD_FALLBACK = "Could not load the admin queue.";

export type AdminCentresLoadResult<T = unknown> =
  | { ok: true; list: T[] }
  | { ok: false; error: string };

export function isAdminIdleTimeoutMessage(message: string | null | undefined): boolean {
  return /admin session timed out/i.test(String(message || ""));
}

function unwrapJsonMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.includes("message")) {
    try {
      const parsed = JSON.parse(trimmed) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // Keep the original text when the payload is not JSON.
    }
  }
  return trimmed;
}

export function extractErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return unwrapJsonMessage(err);
  if (err instanceof Error) return unwrapJsonMessage(err.message);
  if (typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string") return unwrapJsonMessage(message);
  }
  if (typeof err === "object" && "cause" in err) {
    return extractErrorMessage((err as { cause: unknown }).cause);
  }
  return "";
}

export function adminCentresLoadMessage(err: unknown): string {
  const raw = extractErrorMessage(err);
  if (isAdminIdleTimeoutMessage(raw)) return ADMIN_IDLE_TIMEOUT_MESSAGE;
  return raw || ADMIN_CENTRES_LOAD_FALLBACK;
}

export async function settleAdminCentresLoad<T>(
  load: () => Promise<T[]>,
): Promise<AdminCentresLoadResult<T>> {
  try {
    const list = await load();
    return { ok: true, list };
  } catch (err) {
    return { ok: false, error: adminCentresLoadMessage(err) };
  }
}
