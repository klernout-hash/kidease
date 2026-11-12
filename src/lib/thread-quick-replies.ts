/**
 * Short replies a person can drop into the message box and edit before sending.
 * Picking one never sends anything.
 */
export type QuickReply = { id: string; title: string; body: string };

const PARENT_EN: QuickReply[] = [
  { id: "tour-time", title: "Ask for a tour time", body: "Hi, could we book a tour? Weekday mornings work best for us." },
  { id: "open-spot", title: "Ask about an open spot", body: "Hi, do you have a spot open for my child? If so, when could we start?" },
  { id: "fees", title: "Ask about fees", body: "Hi, could you tell me your monthly fee and what it covers?" },
  { id: "running-late", title: "Running late", body: "Hi, I'm running a few minutes late for pickup today. Thank you for your patience." },
  { id: "absent", title: "Child away today", body: "Hi, my child will be away today." },
  { id: "thanks", title: "Thank you", body: "Thank you, that answers my question." },
];

const PARENT_FR: QuickReply[] = [
  { id: "tour-time", title: "Demander une visite", body: "Bonjour, pourrions-nous planifier une visite? Les matins en semaine nous conviennent le mieux." },
  { id: "open-spot", title: "Demander une place", body: "Bonjour, avez-vous une place pour mon enfant? Si oui, quand pourrions-nous commencer?" },
  { id: "fees", title: "Demander les frais", body: "Bonjour, pourriez-vous m'indiquer vos frais mensuels et ce qu'ils couvrent?" },
  { id: "running-late", title: "En retard", body: "Bonjour, j'aurai quelques minutes de retard pour venir chercher mon enfant aujourd'hui. Merci de votre patience." },
  { id: "absent", title: "Enfant absent aujourd'hui", body: "Bonjour, mon enfant sera absent aujourd'hui." },
  { id: "thanks", title: "Merci", body: "Merci, cela répond à ma question." },
];

const CENTRE_EN: QuickReply[] = [
  { id: "got-it", title: "Got your message", body: "Thanks for your message. We'll get back to you by the end of the day." },
  { id: "tour-times", title: "Offer tour times", body: "We'd be glad to show you around. Which days and times work for you?" },
  { id: "no-spot", title: "No spot right now", body: "We don't have a spot open right now. Would you like to join our waitlist?" },
  { id: "thanks", title: "Thank you", body: "Thank you, we've noted that." },
];

const CENTRE_FR: QuickReply[] = [
  { id: "got-it", title: "Message reçu", body: "Merci pour votre message. Nous vous répondrons d'ici la fin de la journée." },
  { id: "tour-times", title: "Proposer une visite", body: "Nous serons heureux de vous faire visiter. Quels jours et quelles heures vous conviennent?" },
  { id: "no-spot", title: "Aucune place pour l'instant", body: "Nous n'avons pas de place pour l'instant. Voulez-vous vous inscrire à notre liste d'attente?" },
  { id: "thanks", title: "Merci", body: "Merci, c'est noté." },
];

export function threadQuickReplies(input: { viewerIsParent: boolean; locale: string }): QuickReply[] {
  const fr = input.locale === "fr";
  if (input.viewerIsParent) return fr ? PARENT_FR : PARENT_EN;
  return fr ? CENTRE_FR : CENTRE_EN;
}

/** Puts the reply in the draft. Text already typed is kept, with the reply on a new line. */
export function applyQuickReply(draft: string, reply: QuickReply): string {
  const current = draft.trim();
  return current ? `${current}\n${reply.body}` : reply.body;
}
