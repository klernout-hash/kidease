/**
 * Branded KidEase email layout. Table-based, inline CSS, mobile-first (390px),
 * 600px max, dark-mode safe. Pure: no DB, no env reads except via args.
 * sendTransactionalMail uses it by default (BRANDED_EMAILS=0 is the only opt-out).
 */
import { CASL_SENDER } from "./casl.ts";

export type EmailLocale = "en" | "fr" | "fr-qc";
export type EmailBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "button"; label: string; href: string }
  | { kind: "code"; text: string }
  /** A short summary card: "Child · Emma", "Last day · Friday, December 18, 2026". */
  | { kind: "details"; rows: { label: string; value: string }[] }
  /** A row of equal buttons (e.g. 0 / 1 / 2 / 3+ open spots). Never raw links. */
  | { kind: "choices"; label?: string; items: { label: string; href: string }[]; hint?: string }
  /** Small grey helper line. */
  | { kind: "note"; text: string };

export type BrandedEmailInput = {
  locale: EmailLocale;
  preheader: string;
  heading: string;
  blocks: EmailBlock[];
  cta?: { label: string; href: string };
  /** Optional quieter second action (outlined button). */
  secondary?: { label: string; href: string };
  /** "Hi Kyle," — shown above the first paragraph. */
  greeting?: string;
  /** Sign-off. Defaults to "The KidEase team" / "L’équipe KidEase". Pass false to hide (sign-in codes). */
  signoff?: string | false;
  /** Bilingual (fr-qc): English copy shown under the French. */
  en?: { heading: string; blocks: EmailBlock[]; cta?: { label: string }; greeting?: string };
  unsubscribeUrl?: string;
  origin?: string;
  /** Short reason line, e.g. "You get this because you manage a listing on KidEase." */
  reason?: string;
};

export const BRAND_BLUE = "#1a3790";
export const BRAND_ACCENT = "#a8481a";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

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

const P = `margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BODY};`;

function blocksHtml(blocks: EmailBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "button") return button(b.label, b.href);
      if (b.kind === "p") return `<p class="ke-text" style="${P}">${escapeHtml(b.text)}</p>`;
      if (b.kind === "note")
        return `<p class="ke-muted" style="margin:0 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};">${escapeHtml(b.text)}</p>`;
      if (b.kind === "code")
        return `<p style="margin:0 0 16px;font-family:'Courier New',monospace;font-size:28px;letter-spacing:6px;font-weight:bold;color:${BRAND_BLUE};" class="ke-code">${escapeHtml(b.text)}</p>`;
      if (b.kind === "details") return details(b.rows);
      if (b.kind === "choices") return choices(b);
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">${b.items
        .map(
          (i) =>
            `<tr><td valign="top" width="20" style="font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND_ACCENT};">&#8226;</td><td class="ke-text" style="font-family:${FONT};font-size:16px;line-height:26px;color:${BODY};padding-bottom:6px;">${escapeHtml(i)}</td></tr>`,
        )
        .join("")}</table>`;
    })
    .join("");
}

function details(rows: { label: string; value: string }[]): string {
  const cells = rows
    .filter((r) => String(r.value || "").trim())
    .map(
      (r, i) =>
        `<tr><td class="ke-text" style="padding:${i ? "12px" : "0"} 0 0;font-family:${FONT};"><div class="ke-muted" style="font-size:13px;line-height:18px;color:${MUTED};">${escapeHtml(r.label)}</div><div class="ke-text" style="font-size:16px;line-height:24px;font-weight:600;color:${INK};">${escapeHtml(r.value)}</div></td></tr>`,
    )
    .join("");
  if (!cells) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ke-panel" style="margin:4px 0 24px;background:#f8fafc;border:1px solid ${LINE};border-radius:12px;"><tr><td style="padding:16px 20px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${cells}</table></td></tr></table>`;
}

function choices(b: { label?: string; items: { label: string; href: string }[]; hint?: string }): string {
  const n = Math.max(1, b.items.length);
  const w = Math.floor(100 / n);
  const cells = b.items
    .map(
      (item, i) =>
        `<td width="${w}%" align="center" style="padding:0 ${i === n - 1 ? 0 : 4}px 0 ${i === 0 ? 0 : 4}px;"><a href="${safeHref(item.href)}" class="ke-choice" style="display:block;padding:14px 0;font-family:${FONT};font-size:20px;line-height:24px;font-weight:700;color:${BRAND_BLUE};text-decoration:none;background:#ffffff;border:2px solid ${BRAND_BLUE};border-radius:12px;">${escapeHtml(item.label)}</a></td>`,
    )
    .join("");
  const label = b.label
    ? `<p class="ke-text" style="margin:0 0 12px;font-family:${FONT};font-size:16px;line-height:24px;font-weight:600;color:${INK};">${escapeHtml(b.label)}</p>`
    : "";
  const hint = b.hint
    ? `<p class="ke-muted" style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(b.hint)}</p>`
    : "";
  return `<div style="margin:4px 0 24px;">${label}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${cells}</tr></table>${hint}</div>`;
}

function button(label: string, href: string, kind: "primary" | "secondary" = "primary"): string {
  const h = safeHref(href);
  const primary = kind === "primary";
  const bg = primary ? BRAND_BLUE : "#ffffff";
  const fg = primary ? "#ffffff" : BRAND_BLUE;
  const border = primary ? BRAND_BLUE : "#cbd5e1";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="ke-btn-wrap" style="margin:${primary ? "8px 0 16px" : "0 0 16px"};"><tr><td align="center" bgcolor="${bg}" class="ke-btn-td" style="border-radius:10px;background:${bg};border:1px solid ${border};">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="20%" fillcolor="${bg}" strokecolor="${border}"><center style="color:${fg};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${h}" class="${primary ? "ke-btn" : "ke-btn2"}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:${fg};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a><!--<![endif]-->
</td></tr></table>`;
}

const COPY = {
  en: {
    tag: "KidEase · Licensed child care, made simpler for families and centres.",
    unsub: "Unsubscribe or manage email preferences",
    help: "Help",
    privacy: "Privacy",
    signoff: "The KidEase team",
    thanks: "Thanks,",
  },
  fr: {
    tag: "KidEase · La garde d’enfants agréée, plus simple pour les familles et les centres.",
    unsub: "Se désabonner ou gérer vos préférences",
    help: "Aide",
    privacy: "Confidentialité",
    signoff: "L’équipe KidEase",
    thanks: "Merci,",
  },
};

/** Footer copy for a locale. fr and fr-qc use French. */
export function emailFooterCopy(locale: EmailLocale) {
  return locale === "en" ? COPY.en : COPY.fr;
}

function greetingHtml(greeting: string | undefined): string {
  return greeting ? `<p class="ke-text" style="${P}">${escapeHtml(greeting)}</p>` : "";
}

function signoffHtml(input: BrandedEmailInput, f: (typeof COPY)["en"]): string {
  if (input.signoff === false) return "";
  const name = typeof input.signoff === "string" && input.signoff.trim() ? input.signoff.trim() : f.signoff;
  return `<p class="ke-text" style="margin:8px 0 0;font-family:${FONT};font-size:16px;line-height:26px;color:${BODY};">${escapeHtml(f.thanks)}<br><strong style="color:${INK};">${escapeHtml(name)}</strong></p>`;
}

export function renderBrandedEmail(input: BrandedEmailInput): string {
  const origin = (input.origin || "https://www.kidease.ca").replace(/\/$/, "");
  const f = emailFooterCopy(input.locale);
  const lang = input.locale === "en" ? "en-CA" : "fr-CA";
  const logo = `${origin}/logo-transparent.png`;
  const second = input.en
    ? `<tr><td class="ke-card ke-pad" style="padding:8px 40px 8px;background:#ffffff;"><hr style="border:0;border-top:1px solid ${LINE};margin:16px 0 24px;"><p class="ke-muted" style="margin:0 0 8px;font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">English follows</p><h2 class="ke-text" style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:28px;color:${INK};" lang="en">${escapeHtml(input.en.heading)}</h2><div lang="en">${greetingHtml(input.en.greeting)}${blocksHtml(input.en.blocks)}</div>${input.cta && input.en.cta ? button(input.en.cta.label, input.cta.href) : ""}</td></tr>`
    : "";
  const unsub = input.unsubscribeUrl
    ? ` &nbsp;·&nbsp; <a href="${safeHref(input.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">${f.unsub}${input.en ? " / Unsubscribe" : ""}</a>`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.heading)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
.ke-text{overflow-wrap:anywhere;word-break:break-word;}
@media (prefers-color-scheme: dark){
 .ke-bg{background:#0b1020 !important;} .ke-card{background:#111827 !important;} .ke-panel{background:#0f172a !important;border-color:#1f2937 !important;}
 .ke-text{color:#e5e7eb !important;} .ke-muted{color:#9ca3af !important;}
 .ke-code{color:#a5b8ff !important;} .ke-choice{background:#111827 !important;color:#c7d2fe !important;border-color:#6377d6 !important;}
}
[data-ogsc] .ke-text{color:#e5e7eb !important;} [data-ogsb] .ke-card{background:#111827 !important;}
@media (max-width:620px){
 .ke-wrap{width:100% !important;} .ke-pad{padding-left:24px !important;padding-right:24px !important;}
 .ke-outer{padding:12px 8px !important;} .ke-h1{font-size:22px !important;line-height:30px !important;}
 .ke-btn-wrap{width:100% !important;} .ke-btn-td{width:100% !important;} .ke-btn,.ke-btn2{display:block !important;text-align:center !important;}
}
</style></head>
<body class="ke-bg" style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ke-bg" style="background:#f1f5f9;"><tr><td align="center" class="ke-outer" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="ke-wrap" style="width:600px;max-width:600px;">
<tr><td class="ke-card" style="height:4px;line-height:4px;font-size:0;background:${BRAND_BLUE};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
<tr><td class="ke-card ke-pad" align="left" style="background:#ffffff;padding:28px 40px 0;">
 <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
 <td style="vertical-align:middle;"><img src="${logo}" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px;"></td>
 <td class="ke-text" style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${BRAND_BLUE};">KidEase</td></tr></table>
</td></tr>
<tr><td class="ke-card ke-pad" style="padding:28px 40px 8px;background:#ffffff;">
 <h1 class="ke-text ke-h1" style="margin:0 0 20px;font-family:${FONT};font-size:26px;line-height:34px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${escapeHtml(input.heading)}</h1>
 ${greetingHtml(input.greeting)}
 ${blocksHtml(input.blocks)}
 ${input.cta ? button(input.cta.label, input.cta.href) : ""}
 ${input.secondary ? button(input.secondary.label, input.secondary.href, "secondary") : ""}
 ${signoffHtml(input, f)}
</td></tr>
${second}
<tr><td class="ke-card ke-pad" style="padding:0 40px 32px;background:#ffffff;border-radius:0 0 16px 16px;">&nbsp;</td></tr>
<tr><td class="ke-pad" align="left" style="padding:24px 40px 8px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
 ${input.reason ? `<p class="ke-muted" style="margin:0 0 10px;color:${MUTED};">${escapeHtml(input.reason)}</p>` : ""}
 <p class="ke-muted" style="margin:0 0 10px;color:${MUTED};"><a href="${origin}/help" style="color:${MUTED};text-decoration:underline;">${f.help}</a> &nbsp;·&nbsp; <a href="${origin}/privacy" style="color:${MUTED};text-decoration:underline;">${f.privacy}</a>${unsub}</p>
 <p class="ke-muted" style="margin:0 0 4px;color:${MUTED};">${escapeHtml(f.tag)}</p>
 <p class="ke-muted" style="margin:0;color:${MUTED};">${escapeHtml(CASL_SENDER.name)} · ${escapeHtml(CASL_SENDER.city)} · <a href="mailto:${escapeHtml(CASL_SENDER.email)}" style="color:${MUTED};">${escapeHtml(CASL_SENDER.email)}</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function blocksText(bs: EmailBlock[], sep = ": "): string[] {
  return bs.flatMap((b) => {
    if (b.kind === "list") return b.items.map((i) => `- ${i}`);
    if (b.kind === "button") return [`${b.label}: ${b.href}`];
    if (b.kind === "details") return b.rows.filter((r) => String(r.value || "").trim()).map((r) => `${r.label}${sep}${r.value}`);
    if (b.kind === "choices") return [...(b.label ? [b.label] : []), ...b.items.map((i) => `${i.label}: ${i.href}`), ...(b.hint ? [b.hint] : [])];
    return [b.text];
  });
}

/** Plain-text part built from the same blocks. */
export function renderBrandedText(input: BrandedEmailInput): string {
  const f = emailFooterCopy(input.locale);
  const t = (h: string, greeting: string | undefined, bs: EmailBlock[], cta?: string) =>
    [
      h,
      "",
      ...(greeting ? [greeting, ""] : []),
      ...blocksText(bs, input.locale === "en" ? ": " : " : ").flatMap((line) => [line, ""]),
      ...(cta && input.cta ? [`${cta}: ${input.cta.href}`] : []),
    ]
      .join("\n")
      .trim();
  const main = [t(input.heading, input.greeting, input.blocks, input.cta?.label)];
  if (input.secondary) main.push(`${input.secondary.label}: ${input.secondary.href}`);
  if (input.signoff !== false) main.push(`${f.thanks}\n${typeof input.signoff === "string" && input.signoff.trim() ? input.signoff.trim() : f.signoff}`);
  const parts = [main.join("\n\n")];
  if (input.en) parts.push("---- English ----", t(input.en.heading, input.en.greeting, input.en.blocks, input.en.cta?.label));
  if (input.reason) parts.push(input.reason);
  if (input.unsubscribeUrl) parts.push(`${input.locale === "en" ? "Unsubscribe" : "Se désabonner / Unsubscribe"}: ${input.unsubscribeUrl}`);
  parts.push(`${CASL_SENDER.name} · ${CASL_SENDER.city}\n${CASL_SENDER.email}\nkidease.ca`);
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
  secondary?: { label: string; href: string };
  greeting?: string;
  signoff?: string | false;
  code?: string;
  reason?: string;
  unsubscribeUrl?: string;
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
    // Each line stays its own paragraph so links and numbers never run together.
    else for (const line of lines) blocks.push({ kind: "p", text: line });
  }
  if (!blocks.length) blocks.push({ kind: "p", text: input.heading });
  return {
    locale: input.locale ?? "en",
    preheader: input.preheader || input.heading,
    heading: input.heading,
    blocks,
    cta: input.cta,
    secondary: input.secondary,
    greeting: input.greeting,
    // Sign-in codes carry no sign-off; everything else is signed by the team.
    signoff: input.signoff ?? (input.code ? false : undefined),
    reason: input.reason,
    unsubscribeUrl: input.unsubscribeUrl,
    origin: input.origin,
    en: input.en,
  };
}
