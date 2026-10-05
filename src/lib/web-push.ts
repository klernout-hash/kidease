/**
 * Web Push endpoint allow-list and permission policy.
 * Pure: no database and no secrets. scripts/web-push.test.mjs loads this in Node.
 *
 * KidEase only calls Notification.requestPermission when the visitor is signed
 * in, the browser supports Web Push, both VAPID keys exist, and FEATURE_PUSH
 * is armed. Unsigned visitors are never prompted.
 */

const PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
  "wns.windows.com",
]);

/** Browser push services only. Blocks a stored endpoint from becoming an open POST. */
export function isAllowedWebPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.toString().length > 2000) return false;
    const host = url.hostname.toLowerCase();
    if (PUSH_HOSTS.has(host)) return true;
    return host.endsWith(".notify.windows.com") || host.endsWith(".wns.windows.com");
  } catch {
    return false;
  }
}

/**
 * Static hosting cannot flip this per environment. `(self)` lets the armed
 * Get alerts button call the Notifications API. `()` would block that call
 * even after Kyle adds VAPID keys. The button itself stays gated.
 */
export function notificationsPolicyDirective(askAllowed: boolean): string {
  return askAllowed ? "notifications=(self)" : "notifications=()";
}

export function sitePermissionsPolicy(input: {
  notifications: boolean;
  camera?: boolean;
  microphone?: boolean;
}): string {
  const camera = input.camera ? "camera=(self)" : "camera=()";
  const microphone = input.microphone ? "microphone=(self)" : "microphone=()";
  const notifications = notificationsPolicyDirective(input.notifications);
  return `${camera}, ${microphone}, geolocation=(self), payment=(self), ${notifications}`;
}
