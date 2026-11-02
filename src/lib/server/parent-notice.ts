/**
 * In-app bell row for a parent. Does not send email, SMS, or push.
 * Those stay behind their own flags and fail closed when keys are missing.
 */
import type { Sql } from "@/lib/db";
import {
  isAllowedNotificationHref,
  type NotificationKind,
  type NotificationTitleKey,
} from "@/lib/notifications";
import { nid } from "@/lib/utils";

export async function saveParentInAppNotice(
  sql: Sql,
  input: {
    userId: string;
    kind: NotificationKind;
    titleKey: NotificationTitleKey;
    href: string;
    sourceKey: string;
    daycareName?: string | null;
    status?: string | null;
  },
): Promise<void> {
  const userId = String(input.userId || "").trim();
  if (!userId || userId.startsWith("guest:")) return;
  const href = String(input.href || "").trim();
  if (!isAllowedNotificationHref(href)) return;
  const sourceKey = String(input.sourceKey || "").trim().slice(0, 180);
  if (!sourceKey) return;
  const { ensureUserNotifications } = await import("./runtime-schema");
  await ensureUserNotifications(sql);
  const name = String(input.daycareName || "").trim().slice(0, 120) || null;
  const status = String(input.status || "").trim().slice(0, 40) || null;
  await sql`
    insert into user_notifications (
      id, user_id, kind, title_key, href, source_key, daycare_name, status, created_at
    ) values (
      ${nid("nt")}, ${userId}, ${input.kind}, ${input.titleKey}, ${href},
      ${sourceKey}, ${name}, ${status}, now()
    )
    on conflict (user_id, source_key) do nothing
  `.catch(() => undefined);
}
