import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { clampTrackNote, normalizeShareEmail, parseShareToken, parseTrackStatus } from "@/lib/parent-tracker";
import { lookupUser } from "@/lib/server/notify";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { nid } from "@/lib/utils";

const SHARE_DAILY_MAX = 8;

export type ShareInviteResult =
  | { ok: true; emailed: boolean; path: string }
  | { ok: false; reason: "email" | "self" | "limit" };

export type ShareAcceptResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "email" | "used" | "self" };

function hashShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

/** Owner of the shortlist this person may edit. Their own list when no share is accepted. */
export async function shortlistUserId(userId: string): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ owner_user_id: string }>`
    select owner_user_id from shortlist_shares
    where accepted_user_id = ${userId}
      and accepted_at is not null
    order by accepted_at desc
    limit 1
  `;
  return rows[0]?.owner_user_id || userId;
}

export const updateSavedTrack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; status?: string; callNote?: string; tourNote?: string }) => input)
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    if (!daycareId || daycareId.length > 80) throw new Error("Save this centre first.");
    const sql = await getSql();
    const owner = await shortlistUserId(context.userId);
    const status = data.status === undefined ? null : parseTrackStatus(data.status);
    const callNote = data.callNote === undefined ? null : clampTrackNote(data.callNote);
    const tourNote = data.tourNote === undefined ? null : clampTrackNote(data.tourNote);
    const rows = await sql<{ daycare_id: string }>`
      update saved_daycares set
        track_status = coalesce(${status}, track_status),
        call_note = coalesce(${callNote}, call_note),
        tour_note = coalesce(${tourNote}, tour_note)
      where user_id = ${owner} and daycare_id = ${daycareId}
      returning daycare_id
    `;
    if (!rows[0]) throw new Error("Save this centre first.");
    return { ok: true as const };
  });

export const inviteShortlistShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email?: string }) => input)
  .handler(async ({ context, data }): Promise<ShareInviteResult> => {
    const email = normalizeShareEmail(data.email);
    if (!email) return { ok: false, reason: "email" };
    const mine = await lookupUser(context.userId);
    if (mine.email && mine.email.trim().toLowerCase() === email) return { ok: false, reason: "self" };
    const owner = await shortlistUserId(context.userId);
    if (owner !== context.userId) return { ok: false, reason: "self" };
    const sql = await getSql();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from shortlist_shares
      where owner_user_id = ${context.userId}
        and created_at > now() - interval '1 day'
    `;
    if ((recent[0]?.n ?? 0) >= SHARE_DAILY_MAX) return { ok: false, reason: "limit" };
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashShareToken(token);
    const id = nid("sh");
    await sql`
      insert into shortlist_shares (id, owner_user_id, invite_email, token_hash)
      values (${id}, ${context.userId}, ${email}, ${tokenHash})
    `;
    const path = `/parent?tab=saved&share=${token}`;
    const url = `${appOrigin()}${path}`;
    const mailed = await sendShareMail(email, url);
    return { ok: true, emailed: mailed, path };
  });

export const acceptShortlistShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { token?: string }) => input)
  .handler(async ({ context, data }): Promise<ShareAcceptResult> => {
    const token = parseShareToken(data.token);
    if (!token) return { ok: false, reason: "missing" };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      owner_user_id: string;
      invite_email: string;
      accepted_user_id: string | null;
    }>`
      select id, owner_user_id, invite_email, accepted_user_id
      from shortlist_shares
      where token_hash = ${hashShareToken(token)}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, reason: "missing" };
    if (row.owner_user_id === context.userId) return { ok: false, reason: "self" };
    const mine = await lookupUser(context.userId);
    const signedIn = mine.email?.trim().toLowerCase() || "";
    if (!signedIn || signedIn !== row.invite_email) return { ok: false, reason: "email" };
    if (row.accepted_user_id && row.accepted_user_id !== context.userId) return { ok: false, reason: "used" };
    await sql`
      update shortlist_shares
      set accepted_user_id = ${context.userId}, accepted_at = coalesce(accepted_at, now())
      where id = ${row.id}
    `;
    return { ok: true };
  });

export const leaveShortlistShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update shortlist_shares
      set accepted_user_id = null, accepted_at = null
      where accepted_user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

async function sendShareMail(to: string, url: string): Promise<boolean> {
  const text = `Hi,

A parent invited you to view and edit their daycare shortlist on KidEase.

Open this link while signed in with this email address:

${url}

If you were not expecting this, you can ignore the email.

KidEase
Un parent vous invite à voir et modifier sa liste de garderies sur KidEase. Ouvrez le lien en étant connecté avec ce courriel.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">A shared shortlist</h1>
      <p style="margin:16px 0 0;color:#5c6578;">A parent invited you to view and edit their daycare shortlist. Sign in with this email, then open the link.</p>
      <p style="margin:24px 0 0;">
        <a href="${escapeAttr(url)}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Open the shortlist</a>
      </p>
      <p style="margin:20px 0 0;font-size:13px;color:#5c6578;">Un parent vous invite à voir et modifier sa liste. Textos et clavardage : à venir.</p>
    </td></tr>
  </table>
</body></html>`;
  try {
    const mail = await sendTransactionalMail({
      purpose: "invite",
      to,
      subject: "A parent shared a KidEase shortlist with you",
      text,
      html,
    });
    return mail.status === "sent";
  } catch {
    return false;
  }
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
