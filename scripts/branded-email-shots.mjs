/**
 * Local renders for the branded-email PR. Does not send mail.
 * node --experimental-strip-types scripts/branded-email-shots.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { renderBrandedEmail } from "../src/lib/email-layout.ts";

const out = new URL("../docs/branded-emails/", import.meta.url);

const templates = {
  "en-list": {
    locale: "en",
    preheader: "Add the missing facts to your listing.",
    heading: "Your listing still needs a few facts",
    blocks: [
      { kind: "p", text: "This is an account notice. KidEase does not invent the missing facts." },
      { kind: "list", items: ["Hours are still blank", "A parent-facing photo is missing", "Age range is not confirmed"] },
    ],
    cta: { label: "Finish my listing", href: "https://www.kidease.ca/provider" },
    unsubscribeUrl: "https://www.kidease.ca/api/unsubscribe?token=preview",
    reason: "You get this because you manage a listing on KidEase.",
  },
  fr: {
    locale: "fr",
    preheader: "Ajoutez les faits manquants à votre fiche.",
    heading: "Votre fiche a encore besoin de quelques faits",
    blocks: [
      { kind: "p", text: "Ceci est un avis de compte. KidEase n'invente pas les faits manquants." },
      { kind: "list", items: ["Les heures sont encore vides", "Une photo pour les parents manque"] },
    ],
    cta: { label: "Compléter ma fiche", href: "https://www.kidease.ca/provider" },
    unsubscribeUrl: "https://www.kidease.ca/api/unsubscribe?token=preview",
    reason: "Vous recevez ce courriel parce que vous gérez une fiche sur KidEase.",
  },
  "fr-qc": {
    locale: "fr-qc",
    preheader: "Une place pourrait être libre près de chez vous.",
    heading: "Une place pourrait être libre près de Montréal",
    blocks: [
      { kind: "p", text: "KidEase a trouvé une place possiblement libre à Jardin des petits, à Montréal." },
      { kind: "p", text: "Ce n'est pas une place réservée. Demandez à la garderie si elle est encore libre." },
    ],
    cta: { label: "Ouvrir la fiche", href: "https://www.kidease.ca/daycare/jardin-des-petits" },
    en: {
      heading: "A spot may be open near Montreal",
      blocks: [
        { kind: "p", text: "KidEase found a possible opening at Jardin des petits in Montreal." },
        { kind: "p", text: "This is not a reserved spot. Ask the centre if it is still open." },
      ],
      cta: { label: "Open the listing" },
    },
    reason: "Vous recevez ce courriel parce que vous avez une alerte de secteur sur KidEase.",
  },
  code: {
    locale: "en",
    preheader: "Your KidEase sign-in code",
    heading: "Your sign-in code",
    blocks: [
      { kind: "p", text: "Enter this code to finish signing in. It expires in 10 minutes." },
      { kind: "code", text: "482913" },
    ],
    reason: "You get this because someone is signing in to your KidEase account.",
  },
  verify: {
    locale: "en",
    preheader: "Confirm your email for KidEase",
    heading: "Verify your email",
    blocks: [{ kind: "p", text: "Confirm this address so KidEase can send you listing updates." }],
    cta: { label: "Verify email", href: "https://www.kidease.ca/verify?token=preview" },
  },
  "spot-offer": {
    locale: "en",
    preheader: "Sunny Days offered you a spot",
    heading: "Sunny Days offered you a spot",
    blocks: [{ kind: "p", text: "This is not a reserved seat until you answer. KidEase does not guarantee the opening." }],
    cta: { label: "Answer now", href: "https://www.kidease.ca/offer/preview" },
    unsubscribeUrl: "https://www.kidease.ca/unsubscribe",
    reason: "You get this because you asked this centre for a spot.",
  },
  invoice: {
    locale: "en",
    preheader: "A bill from Sunny Days",
    heading: "New bill from Sunny Days",
    blocks: [
      { kind: "p", text: "Sunny Days sent you a bill for $840.00 (November 2026). Due December 1." },
      { kind: "p", text: "Pay in KidEase. This is not a text." },
    ],
    cta: { label: "Pay this bill", href: "https://www.kidease.ca/invoices/preview" },
  },
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const widths = [390, 600];
const schemes = ["light", "dark"];
for (const [name, input] of Object.entries(templates)) {
  const html = renderBrandedEmail(input);
  await writeFile(fileURLToPath(new URL(name + ".html", out)), html);
  for (const width of widths) {
    for (const scheme of schemes) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      });
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ colorScheme: scheme });
      const file = fileURLToPath(new URL(`${name}-${width}-${scheme}.png`, out));
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      console.log("wrote", name, width, scheme);
    }
  }
}
await browser.close();
