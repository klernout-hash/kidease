/**
 * Which Phase 1 cards a role may see. Flags still have to be on.
 * A billing role never sees health. A parent never sees another family's tools.
 */

export type Phase1Card =
  | "leads"
  | "waitlist"
  | "offers"
  | "forms"
  | "news"
  | "media"
  | "pickup"
  | "roll"
  | "arrival"
  | "toilet"
  | "menu"
  | "allergy"
  | "incident"
  | "export"
  | "portfolio"
  | "certificate"
  | "screening"
  | "switch"
  | "billing"
  | "messaging"
  | "revenue"
  | "pdf"
  | "audit"
  | "security"
  | "privacy"
  | "fees";

const HEALTH = new Set<Phase1Card>(["toilet", "menu", "allergy", "incident", "media"]);

const ROLE_CARDS: Record<string, readonly Phase1Card[]> = {
  owner: ["leads", "waitlist", "offers", "forms", "news", "media", "pickup", "roll", "arrival", "toilet", "menu", "allergy", "incident", "export", "portfolio", "certificate", "screening", "switch", "billing", "messaging", "revenue", "pdf", "audit", "security", "privacy", "fees"],
  manager: ["leads", "waitlist", "offers", "forms", "news", "media", "pickup", "roll", "arrival", "toilet", "menu", "allergy", "incident", "portfolio", "switch", "fees"],
  admissions: ["leads", "waitlist", "offers", "forms"],
  staff: ["news", "media", "pickup", "roll", "arrival", "toilet", "menu", "allergy"],
  parent: ["waitlist", "offers", "forms", "news", "pickup", "arrival", "toilet", "incident", "portfolio", "fees"],
  billing: ["billing", "revenue"],
};

export function phase1CardsFor(role: string | null | undefined): Phase1Card[] {
  const cards = ROLE_CARDS[role || ""] ?? [];
  if (role === "billing") return cards.filter((card) => !HEALTH.has(card));
  return [...cards];
}

export const PHASE1_CARD_COPY: Record<Phase1Card, { en: string; fr: string; detailEn: string; detailFr: string }> = {
  leads: { en: "Walk-in lead", fr: "Visite sans rendez-vous", detailEn: "Consent to be contacted stays off until the family says yes.", detailFr: "Le consentement reste fermé tant que la famille n'a pas dit oui." },
  waitlist: { en: "Program waitlist", fr: "Liste par programme", detailEn: "A family sees only its own place, as a band.", detailFr: "Une famille voit seulement sa place, en fourchette." },
  offers: { en: "Spot offer", fr: "Offre de place", detailEn: "An offer is held on this page. No email is sent.", detailFr: "L'offre reste sur cette page. Aucun courriel n'est envoyé." },
  forms: { en: "Form status", fr: "État des formulaires", detailEn: "Status moves when someone acts. A rejection is not emailed.", detailFr: "L'état change quand quelqu'un agit. Un refus n'est pas envoyé." },
  news: { en: "Family news", fr: "Nouvelles aux familles", detailEn: "Only the families you pick can see a post.", detailFr: "Seules les familles choisies voient une note." },
  media: { en: "Photos", fr: "Photos", detailEn: "A photo needs consent for every child in it.", detailFr: "Une photo exige le consentement de chaque enfant qui y figure." },
  pickup: { en: "Pickup", fr: "Départ", detailEn: "Only an authorized adult, with a short signature.", detailFr: "Seul un adulte autorisé, avec une courte signature." },
  roll: { en: "Emergency roll", fr: "Appel d'urgence", detailEn: "People checked in. No automatic all-clear.", detailFr: "Les personnes arrivées. Pas de fin automatique." },
  arrival: { en: "Arrival note", fr: "Note d'arrivée", detailEn: "A late note is visible to that child's room.", detailFr: "Un retard est visible pour le local de cet enfant." },
  toilet: { en: "Toileting", fr: "Toilettes", detailEn: "The event you log. No health conclusion.", detailFr: "L'événement noté. Aucune conclusion de santé." },
  menu: { en: "Menu allergens", fr: "Allergènes du menu", detailEn: "Tags from the priority list only.", detailFr: "Seules les étiquettes de la liste prioritaire." },
  allergy: { en: "Allergy badge", fr: "Badge d'allergie", detailEn: "Staff in the room can see it.", detailFr: "Le personnel du local peut le voir." },
  incident: { en: "Incident", fr: "Incident", detailEn: "Shared with that child's guardians only.", detailFr: "Partagé seulement avec les parents de cet enfant." },
  export: { en: "Incident export", fr: "Export des incidents", detailEn: "Other children's names are removed.", detailFr: "Les noms des autres enfants sont retirés." },
  portfolio: { en: "Portfolio", fr: "Portfolio", detailEn: "Only that child's guardians.", detailFr: "Seulement les parents de cet enfant." },
  certificate: { en: "Certificate", fr: "Certificat", detailEn: "A PDF or photo under 8 MB. No new virus scan.", detailFr: "Un PDF ou une photo de moins de 8 Mo. Pas de nouveau scan." },
  screening: { en: "Screening", fr: "Vérification", detailEn: "Missing stays missing. KidEase does not judge it.", detailFr: "Manquant reste manquant. KidEase ne juge pas." },
  switch: { en: "Switch centre", fr: "Changer de centre", detailEn: "A centre you do not belong to is refused.", detailFr: "Un centre dont vous n'êtes pas membre est refusé." },
  billing: { en: "Billing role", fr: "Rôle facturation", detailEn: "Invoices only. Health pages stay closed.", detailFr: "Les factures seulement. Les pages de santé restent fermées." },
  messaging: { en: "Family messages", fr: "Messages aux familles", detailEn: "A restricted staff role cannot message families.", detailFr: "Un rôle restreint ne peut pas écrire aux familles." },
  revenue: { en: "Revenue", fr: "Revenus", detailEn: "A total from the ledger. No charge is made.", detailFr: "Un total du grand livre. Aucun frais n'est chargé." },
  pdf: { en: "PDF export", fr: "Export PDF", detailEn: "Lines are checked here. No new PDF vendor.", detailFr: "Les lignes sont vérifiées ici. Pas de nouveau fournisseur PDF." },
  audit: { en: "Audit log", fr: "Journal d'audit", detailEn: "Owners see only their centres.", detailFr: "Les propriétaires voient seulement leurs centres." },
  security: { en: "Security", fr: "Sécurité", detailEn: "A statement needs evidence. No certification claim.", detailFr: "Un énoncé exige une preuve. Aucune certification." },
  privacy: { en: "Privacy request", fr: "Demande de confidentialité", detailEn: "Goes to the privacy officer. Not a public thread.", detailFr: "Va au responsable de la vie privée. Pas un fil public." },
  fees: { en: "Fees", fr: "Tarifs", detailEn: "Unconfirmed fees stay hidden.", detailFr: "Les tarifs non confirmés restent cachés." },
};
