export type CoparentCopy = {
  title: string;
  lead: string;
  shared: string;
  noSend: string;
  offTitle: string;
  offBody: string;
  home: string;
  access: string;
  full: string;
  view: string;
  create: string;
  copy: string;
  copied: string;
  join: string;
  remove: string;
  saveAccess: string;
  seeChildren: string;
  waiting: string;
  linked: string;
  youLook: string;
  mainParent: string;
  otherParent: string;
  removed: string;
  saved: string;
  bad: string;
  errors: Record<string, string>;
};

const en: CoparentCopy = {
  title: "Share your family",
  lead: "Invite the other parent. They sign in with their own account.",
  shared: "You both see the same children, tours, waitlists, messages, and bills.",
  noSend: "This link stays in KidEase. We do not email or text it.",
  offTitle: "Family sharing is off",
  offBody: "You can still add your child and send a request on your own.",
  home: "Go to your children",
  access: "Access",
  full: "Full access",
  view: "View only",
  create: "Create an invite link",
  copy: "Copy the link",
  copied: "Link copied",
  join: "Join this family",
  remove: "Remove this parent",
  saveAccess: "Save access",
  seeChildren: "See children",
  waiting: "Waiting for the other parent to open the link.",
  linked: "The other parent is linked.",
  youLook: "You can look. You cannot change this family.",
  mainParent: "Main parent",
  otherParent: "The other parent",
  removed: "Removed",
  saved: "Saved",
  bad: "Try that again.",
  errors: {
    off: "Family sharing is off.",
    open: "A second parent is already linked. Remove them before a new invite.",
    member: "Only the main parent can invite.",
    missing: "This invite link is not valid.",
    closed: "This invite is no longer open.",
    self: "Open this link with the other parent's login.",
    busy: "This login is already linked to a family.",
    denied: "Only the main parent can change this.",
  },
};

const fr: CoparentCopy = {
  title: "Partager votre famille",
  lead: "Invitez l’autre parent. Cette personne se connecte avec son propre compte.",
  shared: "Vous voyez les mêmes enfants, visites, listes d’attente, messages et factures.",
  noSend: "Ce lien reste dans KidEase. Nous ne l’envoyons pas par courriel ni par texto.",
  offTitle: "Le partage familial est désactivé",
  offBody: "Vous pouvez encore ajouter votre enfant et envoyer une demande.",
  home: "Voir vos enfants",
  access: "Accès",
  full: "Accès complet",
  view: "Lecture seule",
  create: "Créer un lien d’invitation",
  copy: "Copier le lien",
  copied: "Lien copié",
  join: "Joindre cette famille",
  remove: "Retirer ce parent",
  saveAccess: "Enregistrer l’accès",
  seeChildren: "Voir les enfants",
  waiting: "En attente que l’autre parent ouvre le lien.",
  linked: "L’autre parent est lié.",
  youLook: "Vous pouvez regarder. Vous ne pouvez pas modifier cette famille.",
  mainParent: "Parent principal",
  otherParent: "L’autre parent",
  removed: "Retiré",
  saved: "Enregistré",
  bad: "Réessayez.",
  errors: {
    off: "Le partage familial est désactivé.",
    open: "Un deuxième parent est déjà lié. Retirez-le avant une nouvelle invitation.",
    member: "Seul le parent principal peut inviter.",
    missing: "Ce lien d’invitation n’est pas valide.",
    closed: "Cette invitation n’est plus ouverte.",
    self: "Ouvrez ce lien avec le compte de l’autre parent.",
    busy: "Ce compte est déjà lié à une famille.",
    denied: "Seul le parent principal peut changer ceci.",
  },
};

export function coparentCopy(locale: string): CoparentCopy {
  return locale === "fr" ? fr : en;
}
