import type { LegalSection } from "./legal-copy";

/** Carrier / Twilio A2P reviewers look for this clause on the public privacy URL. */
export const SMS_NO_SHARE =
  "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties, excluding aggregators and providers of the text messaging services (including Twilio).";

export const SMS_PRIVACY_EN: LegalSection = {
  id: "sms",
  title: "Text messages (SMS)",
  blocks: [
    {
      type: "p",
      text: "KidEase may send transactional and service text messages when you give a mobile number and opt in. Examples: sign-in or verification codes, tour or waitlist updates, centre-request notices, and support replies. Message frequency varies. Message and data rates may apply.",
    },
    {
      type: "ul",
      items: [
        "Consent is not a condition of using KidEase or of purchasing a plan.",
        "Reply STOP to cancel. You will get one confirmation text and then no further program messages.",
        "Reply HELP for help, or email kyle@kidease.ca.",
        "You can also turn SMS off in account or alert settings and at /unsubscribe.",
        SMS_NO_SHARE,
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
      text: "KidEase peut envoyer des textos de service lorsque vous donnez un numéro mobile et que vous consentez. Exemples : codes de connexion, mises à jour de visite ou de liste d’attente, avis de demande au centre, réponses du soutien. La fréquence varie. Des frais de messagerie et de données peuvent s’appliquer.",
    },
    {
      type: "ul",
      items: [
        "Le consentement n’est pas une condition d’utilisation de KidEase ni d’un achat.",
        "Répondez STOP pour vous désinscrire. Vous recevrez un accusé, puis plus de textos du programme.",
        "Répondez HELP pour de l’aide, ou écrivez à kyle@kidease.ca.",
        "Vous pouvez aussi désactiver les SMS dans le compte et à /unsubscribe.",
        "Aucun renseignement mobile ne sera communiqué à des tiers ou sociétés affiliées à des fins de marketing ou de promotion. Les données d’adhésion et le consentement SMS ne sont pas communiqués à des tiers, sauf aux agrégateurs et fournisseurs du service de messagerie (dont Twilio).",
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
      text: "By providing your mobile number and opting in, you agree to receive KidEase service texts at that number, which may be sent by an autodialer. Types of messages: verification codes, tour and waitlist updates, centre-request notices, and support. Message frequency varies. Message and data rates may apply.",
    },
    {
      type: "ul",
      items: [
        "Reply STOP to opt out. Reply HELP for help.",
        "Consent is not required to use the website or app.",
        SMS_NO_SHARE,
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
      text: "En donnant votre numéro et en consentant, vous acceptez de recevoir des textos de service KidEase, y compris par composeur automatique. Types : codes, visites, liste d’attente, demandes au centre, soutien. La fréquence varie. Des frais peuvent s’appliquer.",
    },
    {
      type: "ul",
      items: [
        "Répondez STOP pour cesser. Répondez HELP pour de l’aide.",
        "Le consentement n’est pas exigé pour utiliser le site ou l’appli.",
        "Aucun renseignement mobile ne sera communiqué à des tiers à des fins de marketing. Les données d’adhésion SMS ne sont pas vendues ni cédées, sauf à Twilio et aux opérateurs qui livrent le message.",
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
