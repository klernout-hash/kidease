/**
 * Branded KidEase email layout. Table-based, inline CSS, 600px, dark-mode safe.
 * Pure: no DB, no env reads except via args. Used by sendTransactionalMail when BRANDED_EMAILS=1.
 */
export type EmailLocale = "en" | "fr" | "fr-qc";
export type EmailBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; text: string };

export type BrandedEmailInput = {
  locale: EmailLocale;
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  cta?: { label: string; href: string };
  /** Bilingual (fr-qc): English copy shown under the French. */
  en?: { heading: string; blocks: EmailBlock[]; cta?: { label: string } };
  unsubscribeUrl?: string;
  origin?: string;
  /** Short reason line, e.g. "You get this because you manage a listing on KidEase." */
  reason?: string;
};

export const BRAND_BLUE = "#1a3790";
export const BRAND_ACCENT = "#a8481a";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(href: string): string {
  const h = String(href || "").trim();
  return /^https:\/\//i.test(h) || /^mailto:/i.test(h) ? escapeHtml(h) : "#";
}

function blocksHtml(blocks: EmailBlock[]): string {
  const p = "margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1f2937;";
  return blocks
    .map((b) => {
      if (b.kind === "p") return `<p class="ke-text" style="${p}">${escapeHtml(b.text)}</p>`;
      if (b.kind === "code")
        return `<p style="margin:0 0 16px;font-family:'Courier New',monospace;font-size:28px;letter-spacing:6px;font-weight:bold;color:${BRAND_BLUE};" class="ke-code">${escapeHtml(b.text)}</p>`;
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${b.items
        .map(
          (i) =>
            `<tr><td valign="top" width="20" style="font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:${BRAND_ACCENT};">&#8226;</td><td class="ke-text" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#1f2937;padding-bottom:6px;">${escapeHtml(i)}</td></tr>`,
        )
        .join("")}</table>`;
    })
    .join("");
}

function button(label: string, href: string): string {
  const h = safeHref(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td align="center" bgcolor="${BRAND_BLUE}" style="border-radius:999px;background:${BRAND_BLUE};">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" fillcolor="${BRAND_BLUE}" stroke="f"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${h}" class="ke-btn" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;background:${BRAND_BLUE};">${escapeHtml(label)}</a><!--<![endif]-->
</td></tr></table>`;
}

const FOOTER = {
  en: {
    tag: "Licensed child care, easier to find. Free for families during our founding period.",
    unsub: "Unsubscribe",
    help: "Help",
    privacy: "Privacy",
  },
  fr: {
    tag: "Des services de garde agréés, plus faciles à trouver. Gratuit pour les familles pendant notre période de lancement.",
    unsub: "Se désabonner",
    help: "Aide",
    privacy: "Confidentialité",
  },
};

export function renderBrandedEmail(input: BrandedEmailInput): string {
  const origin = (input.origin || "https://www.kidease.ca").replace(/\/$/, "");
  const fr = input.locale !== "en";
  const f = fr ? FOOTER.fr : FOOTER.en;
  const lang = input.locale === "en" ? "en" : "fr-CA";
  const logo = `${origin}/logo-transparent.png`;
  const second = input.en
    ? `<tr><td class="ke-card" style="padding:0 32px 8px;background:#ffffff;"><hr style="border:0;border-top:1px solid #e5e7eb;margin:8px 0 24px;"><p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">English follows</p><h2 class="ke-text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;color:#111827;" lang="en">${escapeHtml(input.en.heading)}</h2><div lang="en">${blocksHtml(input.en.blocks)}</div>${input.cta && input.en.cta ? button(input.en.cta.label, input.cta.href) : ""}</td></tr>`
    : "";
  const unsub = input.unsubscribeUrl
    ? `<a href="${safeHref(input.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">${f.unsub}${input.en ? " / Unsubscribe" : ""}</a> &nbsp;·&nbsp; `
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.heading)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme: dark){
 .ke-bg{background:#0b1020 !important;} .ke-card{background:#111827 !important;}
 .ke-text{color:#e5e7eb !important;} .ke-muted{color:#9ca3af !important;}
 .ke-code{color:#a5b8ff !important;} .ke-head{background:#13235f !important;}
}
[data-ogsc] .ke-text{color:#e5e7eb !important;} [data-ogsb] .ke-card{background:#111827 !important;}
@media (max-width:620px){ .ke-wrap{width:100% !important;} .ke-pad{padding-left:20px !important;padding-right:20px !important;} }
</style></head>
<body class="ke-bg" style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ke-bg" style="background:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="ke-wrap" style="width:600px;max-width:600px;">
<tr><td class="ke-head" align="left" style="background:${BRAND_BLUE};padding:20px 32px;border-radius:16px 16px 0 0;">
 <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
 <td style="background:#ffffff;border-radius:12px;padding:6px;"><img src="${logo}" width="36" height="36" alt="" style="display:block;border:0;width:36px;height:36px;"></td>
 <td style="padding-left:12px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#ffffff;">KidEase</td></tr></table>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${BRAND_ACCENT};">&nbsp;</td></tr>
<tr><td class="ke-card ke-pad" style="padding:32px 32px 8px;background:#ffffff;">
 <h1 class="ke-text" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:32px;color:#111827;">${escapeHtml(input.heading)}</h1>
 ${blocksHtml(input.blocks)}
 ${input.cta ? button(input.cta.label, input.cta.href) : ""}
</td></tr>
${second}
<tr><td class="ke-card ke-pad" style="padding:0 32px 24px;background:#ffffff;border-radius:0 0 16px 16px;">&nbsp;</td></tr>
<tr><td class="ke-pad" align="center" style="padding:20px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">
 <p class="ke-muted" style="margin:0 0 8px;color:#6b7280;">${escapeHtml(f.tag)}</p>
 ${input.reason ? `<p class="ke-muted" style="margin:0 0 8px;color:#6b7280;">${escapeHtml(input.reason)}</p>` : ""}
 <p class="ke-muted" style="margin:0;color:#6b7280;">${unsub}<a href="${origin}/help" style="color:#6b7280;text-decoration:underline;">${f.help}</a> &nbsp;·&nbsp; <a href="${origin}/privacy" style="color:#6b7280;text-decoration:underline;">${f.privacy}</a></p>
 <p class="ke-muted" style="margin:8px 0 0;color:#9ca3af;">KidEase · Canada · <a href="${origin}" style="color:#9ca3af;">kidease.ca</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** Plain-text fallback built from the same blocks. */
export function renderBrandedText(input: BrandedEmailInput): string {
  const t = (h: string, bs: EmailBlock[], cta?: string) =>
    [h, "", ...bs.flatMap((b) => (b.kind === "list" ? b.items.map((i) => `- ${i}`) : [b.text])), ...(cta && input.cta ? ["", `${cta}: ${input.cta.href}`] : [])].join("\n");
  const parts = [t(input.heading, input.blocks, input.cta?.label)];
  if (input.en) parts.push("---- English ----", t(input.en.heading, input.en.blocks, input.en.cta?.label));
  if (input.unsubscribeUrl) parts.push(`${input.locale === "en" ? "Unsubscribe" : "Se désabonner / Unsubscribe"}: ${input.unsubscribeUrl}`);
  parts.push("KidEase · kidease.ca");
  return parts.join("\n\n");
}

/** Quebec recipients get French-first bilingual. */
export function emailLocaleFor(locale: string | null | undefined, province: string | null | undefined): EmailLocale {
  if (String(province || "").trim().toUpperCase() === "QC") return "fr-qc";
  return locale === "fr" ? "fr" : "en";
}

/** Branded content from the plain text a sender already uses. Does not change the subject. */
export function brandedNotice(input: {
  heading: string;
  text: string;
  locale?: EmailLocale;
  preheader?: string;
  cta?: { label: string; href: string };
  code?: string;
  reason?: string;
  origin?: string;
  en?: BrandedEmailInput["en"];
}): BrandedEmailInput {
  const blocks: EmailBlock[] = [];
  if (input.code) blocks.push({ kind: "code", text: input.code });
  const chunks = String(input.text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    const bullets = lines.length > 1 && lines.every((line) => /^[-•]\s+/.test(line));
    if (bullets) blocks.push({ kind: "list", items: lines.map((line) => line.replace(/^[-•]\s+/, "")) });
    else blocks.push({ kind: "p", text: lines.join(" ") });
  }
  if (!blocks.length) blocks.push({ kind: "p", text: input.heading });
  return {
    locale: input.locale ?? "en",
    preheader: input.preheader || input.heading,
    heading: input.heading,
    blocks,
    cta: input.cta,
    reason: input.reason,
    origin: input.origin,
    en: input.en,
  };
}
