/**
 * Parent / daycare-provider signup mail copy.
 * Verify-your-email and provider next-steps are independent of Admin notify.
 * Kept free of DB / Start so unit tests can import it.
 */

export const VERIFY_EMAIL_SUBJECT = "Verify your email — KidEase";
export const PROVIDER_ONBOARD_SUBJECT = "Next steps to get verified on KidEase";

export function signupMailAppOrigin(origin?: string | null): string {
  const raw = (origin || "").trim() || "https://www.kidease.ca";
  return raw.replace(/\/$/, "");
}

export function providerScreeningHref(origin?: string | null): string {
  return `${signupMailAppOrigin(origin)}/provider?desk=screening`;
}

export function providerClaimHref(origin?: string | null): string {
  return `${signupMailAppOrigin(origin)}/claim`;
}

/** Verify mail goes out even when Kyle’s Admin SMS/email failed. */
export function signupUserMailIndependentOfAdmin(_adminStatus?: string | null): true {
  return true;
}

export function shouldSendVerifyEmail(input: {
  email?: string | null;
  emailVerified?: boolean | null;
}): boolean {
  return Boolean((input.email || "").trim()) && !input.emailVerified;
}

export function shouldSendProviderNextSteps(input: {
  role?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
}): boolean {
  return (
    input.role === "provider" &&
    Boolean((input.email || "").trim()) &&
    Boolean(input.emailVerified)
  );
}

export function verifyEmailText(url: string): string {
  return [
    "Verify your KidEase email using this link:",
    "",
    url,
    "",
    "This link expires in about 24 hours. If you did not create a KidEase account, you can ignore this email.",
  ].join("\n");
}

export function verifyEmailHtml(url: string): string {
  const href = escapeAttr(url);
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Verify your email</h1>
      <p style="margin:16px 0 0;color:#5c6578;">Confirm this mailbox so we can reach you about your account. The link expires in about 24 hours. If you did not create a KidEase account, ignore this email.</p>
      <p style="margin:24px 0 0;">
        <a href="${href}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Verify email</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Honest provider onboarding. KidEase reviews uploads. It does not issue
 * Vulnerable Sector Checks — only local police / RCMP (or BC CRRP) can.
 */
export function providerOnboardText(origin?: string | null): string {
  const screening = providerScreeningHref(origin);
  const claim = providerClaimHref(origin);
  return [
    "Thanks for creating a daycare provider account on KidEase.",
    "",
    "Here is how listing verification works. KidEase reviews what you upload. KidEase does not run police checks and does not issue Vulnerable Sector Checks. Only local police / RCMP (or British Columbia’s Criminal Records Review Program) can.",
    "",
    "1. Confirm your email if we asked you to.",
    `2. Claim or complete your listing (name, address, licence number): ${claim}`,
    "3. Open Screening on your Daycare desk. Upload a current Criminal Record Check with Vulnerable Sector Search. In Manitoba, also upload a Child Abuse Registry check, and a Prior Contact check for home-based households.",
    "4. KidEase Admin reviews those files. Parents may see a centre-level “Screening on file” badge after required current documents are cleared. Individual PDFs and names stay private.",
    "",
    `Open Screening: ${screening}`,
    "",
    "Questions: kyle@kidease.ca",
  ].join("\n");
}

export function providerOnboardHtml(origin?: string | null): string {
  const screening = escapeAttr(providerScreeningHref(origin));
  const claim = escapeAttr(providerClaimHref(origin));
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Next steps to get verified</h1>
      <p style="margin:16px 0 0;color:#5c6578;">KidEase reviews what you upload. KidEase does not run police checks and does not issue Vulnerable Sector Checks. Only local police / RCMP (or BC CRRP) can.</p>
      <ol style="margin:16px 0 0;padding-left:20px;color:#1c2438;line-height:1.55;">
        <li>Confirm your email if we asked you to.</li>
        <li>Claim or complete your listing (name, address, licence number).</li>
        <li>Upload a current Vulnerable Sector Check on Screening. Manitoba also needs a Child Abuse Registry check (and Prior Contact for home-based households).</li>
        <li>Admin reviews the files. Parents may see centre-level Screening on file — never individual PDFs or names.</li>
      </ol>
      <p style="margin:24px 0 0;">
        <a href="${claim}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Claim a listing</a>
      </p>
      <p style="margin:12px 0 0;">
        <a href="${screening}" style="display:inline-block;color:#1a3790;font-weight:600;">Open Screening</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
