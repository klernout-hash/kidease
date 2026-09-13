/**
 * Site-owned signup mail for parents / daycare providers.
 * Verify-your-email + provider next-steps are independent of Admin notify.
 * CRM nurture is later and out of scope here. Kept free of DB / Start so tests can import it.
 */

export const VERIFY_EMAIL_SUBJECT = "Verify your email — KidEase";
export const VERIFY_EMAIL_SUBJECT_FR = "Confirmez votre courriel — KidEase";
export const PROVIDER_ONBOARD_SUBJECT = "Next steps to get verified on KidEase";
export const PROVIDER_ONBOARD_SUBJECT_FR = "Prochaines étapes pour être vérifié sur KidEase";
export const PROVIDER_ONBOARD_PURPOSE = "provider_onboard";

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

export function providerListingsHref(origin?: string | null): string {
  return `${signupMailAppOrigin(origin)}/provider?desk=listings`;
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

/** Next-steps fire on provider signup and/or first listing — not gated on mailbox verify. */
export function shouldSendProviderNextSteps(input: {
  role?: string | null;
  email?: string | null;
  emailVerified?: boolean | null;
}): boolean {
  return input.role === "provider" && Boolean((input.email || "").trim());
}

/** Winnipeg calendar day (YYYY-MM-DD) so two triggers the same day do not spam. */
export function winnipegDayKey(at: Date = new Date()): string {
  return at.toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
}

export function sameWinnipegDay(a: Date, b: Date = new Date()): boolean {
  return winnipegDayKey(a) === winnipegDayKey(b);
}

export function greetingName(name?: string | null): string {
  const v = (name || "").replace(/\s+/g, " ").trim();
  if (!v || v === "—") return "";
  return v.split(" ")[0] || "";
}

function hello(name?: string | null, locale: "en" | "fr" = "en"): string {
  const first = greetingName(name);
  if (locale === "fr") return first ? `Bonjour ${first},` : "Bonjour,";
  return first ? `Hi ${first},` : "Hi,";
}

export function verifyEmailText(url: string, name?: string | null): string {
  return [
    hello(name, "en"),
    "",
    "Thanks for signing up with KidEase.",
    "",
    "Please verify this email so we can reach you about your account.",
    "",
    url,
    "",
    "This link expires in about 24 hours. If you did not create a KidEase account, you can ignore this email.",
    "",
    "— KidEase",
    "kyle@kidease.ca",
    "",
    "—",
    "",
    hello(name, "fr"),
    "",
    "Merci de vous inscrire à KidEase.",
    "",
    "Veuillez confirmer ce courriel pour que nous puissions vous joindre au sujet de votre compte.",
    "",
    url,
    "",
    "Ce lien expire dans environ 24 heures. Si vous n’avez pas créé de compte KidEase, ignorez ce message.",
    "",
    "— KidEase",
    "kyle@kidease.ca",
  ].join("\n");
}

export function verifyEmailHtml(url: string, name?: string | null): string {
  const href = escapeAttr(url);
  const enHi = escapeHtml(hello(name, "en"));
  const frHi = escapeHtml(hello(name, "fr"));
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Verify your email</h1>
      <p style="margin:16px 0 0;">${enHi}</p>
      <p style="margin:16px 0 0;color:#5c6578;">Thanks for signing up with KidEase. Please verify this email so we can reach you about your account. The link expires in about 24 hours.</p>
      <p style="margin:24px 0 0;">
        <a href="${href}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Verify email</a>
      </p>
      <p style="margin:28px 0 0;font-size:13px;color:#5c6578;">${frHi} Merci de vous inscrire à KidEase. Confirmez ce courriel pour que nous puissions vous joindre. Ce lien expire dans environ 24 heures.</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Honest provider onboarding (EN + FR-CA). KidEase reviews uploads.
 * It does not issue Vulnerable Sector Checks — only local police / RCMP (or BC CRRP) can.
 */
export function providerOnboardText(origin?: string | null, name?: string | null): string {
  const listings = providerListingsHref(origin);
  const claim = providerClaimHref(origin);
  const screening = providerScreeningHref(origin);
  return [
    hello(name, "en"),
    "",
    "Thanks for joining KidEase as a daycare provider.",
    "",
    "Here are the next steps to get verified. KidEase reviews what you upload. KidEase does not run police checks and does not issue Vulnerable Sector Checks. Only local police / RCMP (or British Columbia’s Criminal Records Review Program) can.",
    "",
    `1. Complete your listing — name, address, hours, and open spots: ${listings}`,
    "2. Add your current licence number.",
    `3. Claim the listing if we already have it from the public registry: ${claim}`,
    `4. When you are ready, upload a current Vulnerable Sector Check on Screening. In Manitoba, also upload a Child Abuse Registry check, and a Prior Contact check for home-based households: ${screening}`,
    "5. KidEase Admin reviews those files. Parents may see a centre-level “Screening on file” badge after required current documents are cleared. Individual PDFs and names stay private.",
    "",
    "Questions: kyle@kidease.ca",
    "",
    "—",
    "",
    hello(name, "fr"),
    "",
    "Merci de joindre KidEase comme fournisseur de garde.",
    "",
    "Voici les prochaines étapes pour être vérifié. KidEase examine ce que vous téléversez. KidEase ne fait pas de contrôles policiers et ne délivre pas de vérifications du secteur vulnérable. Seule la police locale / la GRC (ou le CRRP de la C.-B.) le peut.",
    "",
    `1. Complétez votre fiche — nom, adresse, heures et places : ${listings}`,
    "2. Ajoutez votre numéro de permis actuel.",
    `3. Réclamez la fiche si nous l’avons déjà à partir du registre public : ${claim}`,
    `4. Quand vous êtes prêt, téléversez une vérification du secteur vulnérable à jour dans Filtrage. Au Manitoba, ajoutez aussi le registre des mauvais traitements et, pour un milieu familial, une vérification des contacts antérieurs : ${screening}`,
    "5. L’Admin KidEase examine ces dossiers. Les parents peuvent voir un badge « Dossier de filtrage » au niveau du centre lorsque les documents requis et à jour sont acceptés. Les PDF et les noms restent privés.",
    "",
    "Questions : kyle@kidease.ca",
  ].join("\n");
}

export function providerOnboardHtml(origin?: string | null, name?: string | null): string {
  const listings = escapeAttr(providerListingsHref(origin));
  const claim = escapeAttr(providerClaimHref(origin));
  const screening = escapeAttr(providerScreeningHref(origin));
  const enHi = escapeHtml(hello(name, "en"));
  const frHi = escapeHtml(hello(name, "fr"));
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:24px;">Next steps to get verified</h1>
      <p style="margin:16px 0 0;">${enHi}</p>
      <p style="margin:12px 0 0;color:#5c6578;">Thanks for joining KidEase as a daycare provider. KidEase reviews what you upload. KidEase does not run police checks and does not issue Vulnerable Sector Checks. Only local police / RCMP (or BC CRRP) can.</p>
      <ol style="margin:16px 0 0;padding-left:20px;color:#1c2438;line-height:1.55;">
        <li>Complete your listing — name, address, hours, and open spots.</li>
        <li>Add your current licence number.</li>
        <li>Claim the listing if we already have it from the public registry.</li>
        <li>When ready, upload a current Vulnerable Sector Check on Screening. Manitoba also needs a Child Abuse Registry check (and Prior Contact for home-based households).</li>
        <li>Admin reviews the files. Parents may see centre-level Screening on file — never individual PDFs or names.</li>
      </ol>
      <p style="margin:24px 0 0;">
        <a href="${listings}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600;">Complete listing</a>
      </p>
      <p style="margin:12px 0 0;"><a href="${claim}" style="color:#1a3790;font-weight:600;">Claim a listing</a> · <a href="${screening}" style="color:#1a3790;font-weight:600;">Open Screening</a></p>
      <p style="margin:28px 0 0;font-size:13px;color:#5c6578;">${frHi} Merci de joindre KidEase comme fournisseur de garde. KidEase examine vos téléversements et ne fait pas de contrôles policiers. Complétez la fiche, ajoutez le permis, réclamez au besoin, puis téléversez le VSC (et au Manitoba le registre des mauvais traitements) dans Filtrage.</p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
