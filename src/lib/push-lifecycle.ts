/**
 * Phone-alert rules that do not send. A tap may open only a KidEase page.
 * The lock-screen line stays a short notice, never a message body or a child name.
 */

export const MESSAGE_CHANNEL_ID = "kidease_messages";

export function pushRegisterLocale(raw: string | null | undefined): "en" | "fr" {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "fr" || value.startsWith("fr-")) return "fr";
  return "en";
}

export function pushPermissionDecision(receive: string | null | undefined): "ask" | "register" | "denied" {
  if (receive === "granted") return "register";
  if (receive === "prompt" || receive === "prompt-with-rationale") return "ask";
  return "denied";
}

/** Path on kidease.ca only. Other hosts, scripts, and passwords are dropped. */
export function pushOpenPath(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed = host === "kidease.ca" || host === "www.kidease.ca" || host.endsWith(".kidease.ca");
  if (!allowed) return null;
  const path = `${url.pathname || "/"}${url.search}`;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

export function ordinaryFcmMessage(input: { token: string; title: string; body: string; url?: string }) {
  return {
    message: {
      token: input.token,
      notification: { title: input.title, body: input.body },
      android: {
        priority: "NORMAL",
        notification: {
          channel_id: MESSAGE_CHANNEL_ID,
          visibility: "PRIVATE",
        },
      },
      ...(input.url ? { data: { url: input.url } } : {}),
    },
  };
}

/** Ordinary alerts are not Time Sensitive and do not set a badge unless a count was stored. */
export function ordinaryApnsAps(input: { title: string; body: string; badge?: number | null }) {
  const aps: { alert: { title: string; body: string }; sound: "default"; badge?: number } = {
    alert: { title: input.title, body: input.body },
    sound: "default",
  };
  if (typeof input.badge === "number" && Number.isFinite(input.badge) && input.badge >= 0) {
    aps.badge = Math.min(99, Math.floor(input.badge));
  }
  return aps;
}
