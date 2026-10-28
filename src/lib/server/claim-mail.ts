import { ADMIN_EMAIL } from "@/lib/server/notify";
import { sendTransactionalMail } from "@/lib/transactional-mail";

function maskEmail(email: string) {
  return email.replace(/(^.).*(@.*$)/, "$1•••$2");
}

/** Email when a claim code does not match. Never include a code. */
export async function sendClaimUnmatchedEmail(input: { to: string; centreName: string }) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) return { status: "skipped" as const };
  const centre = input.centreName.trim() || "the centre";
  const subject = `We couldn't verify this claim yet`;
  const text = `We couldn't verify this claim yet for ${centre}.\n\nYou can upload the provincial licence on the claim page. KidEase still reviews every claim before the listing goes live.\n\nIf you did not start this claim, you can ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:22px;line-height:1.3;">We couldn't verify this claim yet</h1>
      <p style="margin:16px 0 0;">We couldn't match the code for ${centre}. Upload the provincial licence and we will review it. The listing stays off until that review is done.</p>
    </td></tr>
  </table>
</body></html>`;
  const result = await sendTransactionalMail({
    purpose: "claim",
    to,
    subject,
    text,
    html,
    replyTo: ADMIN_EMAIL,
  });
  return { status: result.status };
}

/** Email the listing-claim code. Never log the code. */
export async function sendClaimCodeEmail(input: { to: string; code: string; centreName: string }) {
  const to = input.to.trim().toLowerCase();
  if (!to || !to.includes("@")) throw new Error("This account has no email for a claim code.");
  const centre = input.centreName.trim() || "your centre";
  const subject = `Your KidEase claim code for ${centre}`;
  const text = `Your KidEase claim code for ${centre} is ${input.code}.\n\nEnter this code on the claim page to verify you manage the listing. If you did not start a claim, you can ignore this email.`;
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:28px;letter-spacing:.12em;">${input.code}</h1>
      <p style="margin:16px 0 0;color:#5c6578;">Enter this code on the claim page, then upload the provincial licence. KidEase still reviews the claim before the listing goes live.</p>
    </td></tr>
  </table>
</body></html>`;
  const result = await sendTransactionalMail({
    purpose: "claim",
    to,
    subject,
    text,
    html,
    replyTo: ADMIN_EMAIL,
  });
  if (result.status === "logged") console.info("[kidease-claim] code emailed to registered inbox");
  return { status: result.status, emailed: maskEmail(to) };
}
