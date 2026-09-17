import type { Locale } from "./types";

type DocusignEnvIssue = { name: string; reason: "missing" | "not_pem" };

type DsKey =
  | "needSign"
  | "out"
  | "signed"
  | "centres"
  | "leadLive"
  | "leadOff"
  | "leadPem"
  | "leadLoadFailed"
  | "leadUnknown"
  | "envHint"
  | "consentBanner"
  | "search"
  | "filterNeed"
  | "filterSent"
  | "filterSigned"
  | "filterAll"
  | "send"
  | "resend"
  | "sendAgain"
  | "sendOff"
  | "openSigning"
  | "void"
  | "download"
  | "refresh"
  | "packAgreement"
  | "packEnrolment"
  | "template"
  | "templateInApp"
  | "templateDefault"
  | "signerEmail"
  | "signerName"
  | "noEmail"
  | "noMatch"
  | "statusNone"
  | "alreadySigned"
  | "continueDocusign"
  | "waitingDocusign"
  | "providerTitle"
  | "providerEmpty"
  | "providerReview"
  | "providerSigned"
  | "signKicker"
  | "signInApp"
  | "backDesk"
  | "reviewOnProfile";

const en: Record<DsKey, string> = {
  needSign: "Need a signature",
  out: "Out for signature",
  signed: "Signed",
  centres: "Centres",
  leadLive:
    "Send the licensed centre agreement or the enrolment paperwork pack. DocuSign emails the provider. The signed PDF lands on the daycare profile for you and the centre to review.",
  leadOff:
    "DocuSign keys are not set. Send is off so we do not pretend envelopes leave KidEase. Centres can still sign the in-app document from their desk.",
  leadPem:
    "DOCUSIGN_PRIVATE_KEY is set but is not a PEM (needs a BEGIN line). Send stays off. Re-paste the RSA key on Vercel as one line with the two characters \\n for newlines.",
  leadLoadFailed:
    "Could not load DocuSign status. Send stays off until Admin Contracts refreshes. This is not a missing-key report.",
  leadUnknown:
    "DocuSign is not ready. Send is off so we do not pretend envelopes leave KidEase. Centres can still sign the in-app document from their desk.",
  envHint:
    "Set the DOCUSIGN_* names on Vercel (Production + Preview) when you want live envelopes. See docs/docusign.md. Until then this list is a status board only.",
  consentBanner: "DocuSign not connected — finish JWT consent",
  search: "Search centre, city, signer…",
  filterNeed: "Need sign",
  filterSent: "Sent",
  filterSigned: "Signed",
  filterAll: "All",
  send: "Send to sign",
  resend: "Resend",
  sendAgain: "Send again",
  sendOff: "Send (DocuSign off)",
  openSigning: "Open signing",
  void: "Void",
  download: "Download signed PDF",
  refresh: "Refresh status",
  packAgreement: "Provider agreement",
  packEnrolment: "Enrolment pack",
  template: "DocuSign template",
  templateInApp: "KidEase bilingual document",
  templateDefault: "Account default template",
  signerEmail: "Signer email",
  signerName: "Signer name",
  noEmail: "no email",
  noMatch: "No centres match that filter.",
  statusNone: "Not sent",
  alreadySigned: "Already signed",
  continueDocusign: "Continue in DocuSign",
  waitingDocusign: "Waiting on DocuSign. Ask KidEase to resend the envelope.",
  providerTitle: "Centre paperwork",
  providerEmpty:
    "When KidEase sends the licensed centre agreement or an enrolment pack, it will show here to sign. Signed copies stay on this profile for review.",
  providerReview: "Review and sign",
  providerSigned: "Signed",
  signKicker: "KidEase paperwork",
  signInApp: "Sign this agreement",
  backDesk: "Back to centre desk",
  reviewOnProfile: "Signed copy on this daycare profile",
};

const fr: Record<DsKey, string> = {
  needSign: "Signature requise",
  out: "En attente de signature",
  signed: "Signé",
  centres: "Centres",
  leadLive:
    "Envoyez l’entente du centre permis ou la trousse d’inscription. DocuSign écrit au fournisseur. Le PDF signé arrive sur le profil de la garderie pour vous et le centre.",
  leadOff:
    "Les clés DocuSign ne sont pas définies. Envoi désactivé : nous ne prétendons pas que des enveloppes quittent KidEase. Les centres peuvent encore signer le document dans l’appli.",
  leadPem:
    "DOCUSIGN_PRIVATE_KEY est défini mais n’est pas un PEM (ligne BEGIN requise). Envoi désactivé. Recollez la clé RSA sur Vercel sur une ligne avec les deux caractères \\n pour les sauts de ligne.",
  leadLoadFailed:
    "Impossible de charger l’état DocuSign. L’envoi reste désactivé jusqu’à l’actualisation. Ce n’est pas un rapport de clés manquantes.",
  leadUnknown:
    "DocuSign n’est pas prêt. Envoi désactivé : nous ne prétendons pas que des enveloppes quittent KidEase. Les centres peuvent encore signer le document dans l’appli.",
  envHint:
    "Définissez les noms DOCUSIGN_* sur Vercel (Production + Preview) pour les enveloppes en direct. Voir docs/docusign.md. D’ici là, cette liste est un tableau de statut seulement.",
  consentBanner: "DocuSign n’est pas connecté — terminez le consentement JWT",
  search: "Rechercher un centre, une ville, un signataire…",
  filterNeed: "À signer",
  filterSent: "Envoyé",
  filterSigned: "Signé",
  filterAll: "Tous",
  send: "Envoyer à signer",
  resend: "Renvoyer",
  sendAgain: "Envoyer de nouveau",
  sendOff: "Envoyer (DocuSign off)",
  openSigning: "Ouvrir la signature",
  void: "Annuler",
  download: "Télécharger le PDF signé",
  refresh: "Actualiser le statut",
  packAgreement: "Entente du fournisseur",
  packEnrolment: "Trousse d’inscription",
  template: "Modèle DocuSign",
  templateInApp: "Document bilingue KidEase",
  templateDefault: "Modèle par défaut du compte",
  signerEmail: "Courriel du signataire",
  signerName: "Nom du signataire",
  noEmail: "aucun courriel",
  noMatch: "Aucun centre ne correspond à ce filtre.",
  statusNone: "Non envoyé",
  alreadySigned: "Déjà signé",
  continueDocusign: "Continuer dans DocuSign",
  waitingDocusign: "En attente de DocuSign. Demandez à KidEase de renvoyer l’enveloppe.",
  providerTitle: "Documents du centre",
  providerEmpty:
    "Lorsque KidEase envoie l’entente du centre permis ou une trousse d’inscription, elle apparaît ici. Les copies signées restent sur ce profil.",
  providerReview: "Lire et signer",
  providerSigned: "Signé",
  signKicker: "Documents KidEase",
  signInApp: "Signer cette entente",
  backDesk: "Retour au bureau du centre",
  reviewOnProfile: "Copie signée sur le profil de cette garderie",
};

export function ds(locale: Locale, key: DsKey) {
  return locale === "fr" ? fr[key] : en[key];
}

export function docusignLeadKey(input: {
  mode: "live" | "demo";
  issues?: DocusignEnvIssue[];
  loadFailed?: boolean;
}): "leadLive" | "leadOff" | "leadPem" | "leadLoadFailed" | "leadUnknown" {
  if (input.mode === "live") return "leadLive";
  if (input.loadFailed) return "leadLoadFailed";
  const issues = input.issues || [];
  const pemOnly = issues.length > 0 && issues.every((issue) => issue.reason === "not_pem");
  if (pemOnly) return "leadPem";
  if (issues.some((issue) => issue.reason === "missing")) return "leadOff";
  return "leadUnknown";
}

/** Operator-facing names only — never values. */
export function formatDocusignEnvIssues(locale: Locale, issues: DocusignEnvIssue[]): string {
  if (!issues.length) return "";
  const bits = issues.map((issue) => {
    if (issue.reason === "not_pem") {
      return locale === "fr"
        ? `${issue.name} n’est pas un PEM (ligne BEGIN requise)`
        : `${issue.name} is not a PEM (needs a BEGIN line)`;
    }
    return issue.name;
  });
  return locale === "fr" ? `Manquant : ${bits.join(", ")}.` : `Missing: ${bits.join(", ")}.`;
}
