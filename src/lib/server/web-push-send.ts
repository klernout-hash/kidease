/**
 * Deliver one transactional Web Push to stored browser subscriptions.
 * No-ops unless FEATURE_PUSH is armed and both VAPID keys are set.
 * Never logs keys, endpoints, or payload text.
 */

import { getSql } from "@/lib/db";
import { pushArmed } from "@/lib/channel-readiness";
import { vapidPrivateKey, vapidPublicKey, vapidSubject, webPushCredentialsPresent } from "@/lib/push";
import { isAllowedWebPushEndpoint } from "@/lib/web-push";
import { encryptWebPushPayload, vapidAuthorization, vapidKeysMatch } from "@/lib/web-push-crypto";

type EnvMap = Record<string, string | undefined>;

export type WebPushSendResult = {
  sent: number;
  failed: number;
  removed: number;
  skipped: boolean;
  reason?: string;
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export async function sendWebPushToUser(
  input: { userId: string; title: string; body: string; url: string },
  options: { env?: EnvMap; fetchImpl?: typeof fetch; nowSec?: number } = {},
): Promise<WebPushSendResult> {
  const env = options.env ?? process.env;
  if (!pushArmed(env) || !webPushCredentialsPresent(env)) {
    return { sent: 0, failed: 0, removed: 0, skipped: true, reason: "off" };
  }
  const publicKey = vapidPublicKey(env);
  const privateKey = vapidPrivateKey(env);
  if (!vapidKeysMatch(publicKey, privateKey)) {
    console.error("[kidease-web-push] VAPID public key does not match the private key");
    return { sent: 0, failed: 0, removed: 0, skipped: true, reason: "key_mismatch" };
  }
  const userId = String(input.userId || "").trim();
  if (!userId) return { sent: 0, failed: 0, removed: 0, skipped: true, reason: "no_user" };
  const sql = await getSql();
  const rows = await sql<SubRow>`
    select id, endpoint, p256dh, auth_key
    from web_push_subscriptions
    where user_id = ${userId}
    order by last_seen_at desc
    limit 8
  `.catch(() => [] as SubRow[]);
  if (!rows.length) return { sent: 0, failed: 0, removed: 0, skipped: true, reason: "no_subscription" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    title: input.title.slice(0, 80),
    body: input.body.slice(0, 180),
    url: input.url.startsWith("/") ? input.url.slice(0, 300) : "/notifications",
  });
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const row of rows) {
    if (!isAllowedWebPushEndpoint(row.endpoint)) {
      failed += 1;
      continue;
    }
    try {
      const record = encryptWebPushPayload({ payload, p256dh: row.p256dh, auth: row.auth_key });
      const body = new Uint8Array(record.byteLength);
      body.set(record);
      const res = await fetchImpl(row.endpoint, {
        method: "POST",
        headers: {
          Authorization: vapidAuthorization({
            endpoint: row.endpoint,
            publicKey,
            privateKey,
            subject: vapidSubject(env),
            nowSec,
          }),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          TTL: "86400",
        },
        body,
      });
      if (res.ok) {
        sent += 1;
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        removed += 1;
        await sql`delete from web_push_subscriptions where id = ${row.id}`.catch(() => undefined);
        continue;
      }
      failed += 1;
    } catch {
      failed += 1;
    }
  }
  console.info("[kidease-web-push]", { event: "send", sent, failed, removed, subscriptions: rows.length });
  return { sent, failed, removed, skipped: sent === 0 };
}
