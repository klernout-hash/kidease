import type { LegalSection } from "./legal-copy";

/** Twilio requires this sentence word for word on the public privacy policy. */
export const SMS_TWILIO_REQUIRED =
  "All the above categories exclude text messaging originator opt-in data and consent; this information won't be shared with any third parties.";

/** French privacy page. The English sentence stays word for word on /privacy for Twilio. */
export const SMS_TWILIO_REQUIRED_FR =
  "Les catégories ci-dessus excluent les données d’adhésion et de consentement aux textos ; ces renseignements ne seront communiqués à aucun tiers.";

export const SMS_NO_SHARE = SMS_TWILIO_REQUIRED;

export const SMS_PRIVACY_EN: LegalSection = {
  id: "sms",
  title: "Text messages (SMS)",
  blocks: [
    {
      type: "p",
      text: "KidEase (Winnipeg, Manitoba) sends service texts to your mobile number only after you give express consent. These texts cover sign-in codes, tours, waitlists, requests to daycares, and support replies. SMS is optional. Message frequency varies. Message and data rates may apply.",
    },
    {
      type: "p",
      text: SMS_TWILIO_REQUIRED,
    },
    {
      type: "ul",
      items: [
        "Withdraw consent at any time by replying STOP or ARRÊT, or by turning off texts at kidease.ca/unsubscribe.",
        "Contact KidEase at support@kidease.ca or 1-877-502-7728. You can also reply HELP.",
        "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.",
        "Twilio is our text-message processor. It receives the destination number and message body only to deliver that text. See https://www.twilio.com/en-us/legal/privacy",
      ],
    },
    { type: "link", to: "/terms", label: "SMS program terms" },
    { type: "link", to: "/unsubscribe", label: "Unsubscribe from marketing email or SMS" },
  ],
};

export const SMS_PRIVACY_FR: LegalSection = {
  id: "sms",
  title: "Messages texte (SMS)",
  blocks: [
    {
      type: "p",
      text: "KidEase (Winnipeg, Manitoba) envoie des textos de service à votre numéro de cellulaire uniquement avec votre consentement exprès. Ces textos portent sur les codes de connexion, les visites, les listes d’attente, les demandes aux garderies et les réponses du soutien. Les textos sont facultatifs. La fréquence des messages varie. Des frais de messagerie et de données peuvent s’appliquer.",
    },
    {
      type: "p",
      text: SMS_TWILIO_REQUIRED_FR,
    },
    {
      type: "ul",
      items: [
        "Retirez votre consentement en tout temps en répondant ARRÊT ou STOP, ou en désactivant les textos à kidease.ca/unsubscribe.",
        "Joignez KidEase à support@kidease.ca ou au 1-877-502-7728. Vous pouvez aussi répondre AIDE.",
        "Twilio traite l’envoi des textos. Il reçoit le numéro et le message seulement pour livrer ce texte. https://www.twilio.com/en-us/legal/privacy",
      ],
    },
    { type: "link", to: "/terms", label: "Conditions du programme SMS" },
    { type: "link", to: "/unsubscribe", label: "Se désinscrire du courriel ou des SMS marketing" },
  ],
};

export const SMS_TERMS_EN: LegalSection = {
  id: "sms",
  title: "Text message program",
  blocks: [
    {
      type: "p",
      text: "KidEase (Winnipeg, Manitoba) sends service texts to your mobile number only after you give express consent. These texts cover sign-in codes, tours, waitlists, requests to daycares, and support replies. SMS is optional. Message frequency varies. Message and data rates may apply.",
    },
    {
      type: "p",
      text: SMS_TWILIO_REQUIRED,
    },
    {
      type: "ul",
      items: [
        "Withdraw consent at any time by replying STOP or ARRÊT, or by turning off texts at kidease.ca/unsubscribe.",
        "Contact KidEase at support@kidease.ca or 1-877-502-7728. You can also reply HELP.",
        "Privacy Policy: https://kidease.ca/privacy",
      ],
    },
  ],
};

export const SMS_TERMS_FR: LegalSection = {
  id: "sms",
  title: "Programme de messages texte",
  blocks: [
    {
      type: "p",
      text: "KidEase (Winnipeg, Manitoba) envoie des textos de service à votre numéro de cellulaire uniquement avec votre consentement exprès. Ces textos portent sur les codes de connexion, les visites, les listes d’attente, les demandes aux garderies et les réponses du soutien. Les textos sont facultatifs. La fréquence des messages varie. Des frais de messagerie et de données peuvent s’appliquer.",
    },
    {
      type: "p",
      text: SMS_TWILIO_REQUIRED_FR,
    },
    {
      type: "ul",
      items: [
        "Retirez votre consentement en tout temps en répondant ARRÊT ou STOP, ou en désactivant les textos à kidease.ca/unsubscribe.",
        "Joignez KidEase à support@kidease.ca ou au 1-877-502-7728. Vous pouvez aussi répondre AIDE.",
        "Politique de confidentialité : https://kidease.ca/privacy",
      ],
    },
  ],
};

export function withSmsSection<T extends { sections: LegalSection[] }>(doc: T, section: LegalSection): T {
  if (doc.sections.some((s) => s.id === "sms")) return doc;
  const emailIdx = doc.sections.findIndex((s) => s.id === "email");
  const next = [...doc.sections];
  if (emailIdx >= 0) next.splice(emailIdx + 1, 0, section);
  else next.push(section);
  return { ...doc, sections: next };
}
