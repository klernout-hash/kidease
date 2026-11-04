export type CustodyCopy = {
  title: string;
  lead: string;
  emailLabel: string;
  send: string;
  sent: string;
  preview: string;
  mustAccept: string;
  waiting: string;
  expires: string;
  join: string;
  remove: string;
  verified: string;
  notVerified: string;
  confirm: string;
  confirmed: string;
  mainParent: string;
  otherParent: string;
  pickupYes: string;
  pickupNo: string;
  fileLocked: string;
  restrictTitle: string;
  restrictLead: string;
  mode: string;
  restrict: string;
  block: string;
  note: string;
  file: string;
  save: string;
  lift: string;
  staffOnly: string;
  blockedFamily: string;
  saved: string;
  bad: string;
  errors: Record<string, string>;
};

const en: CustodyCopy = {
  title: "Invite the other parent",
  lead: "They get an email and must accept with their own login. KidEase does not accept for them.",
  emailLabel: "Their email",
  send: "Send invite",
  sent: "Invite sent. They must accept.",
  preview: "Preview does not send this email. They can still accept from the link after they sign in.",
  mustAccept: "This invite stays open until they accept.",
  waiting: "Waiting for them to accept.",
  expires: "The invite expires in 7 days.",
  join: "Accept with this login",
  remove: "Remove this parent",
  verified: "Confirmed by this daycare",
  notVerified: "Not confirmed yet",
  confirm: "Confirm this parent",
  confirmed: "Confirmed",
  mainParent: "Main parent",
  otherParent: "Other parent",
  pickupYes: "Can pick up",
  pickupNo: "Not a pickup person",
  fileLocked: "A daycare must confirm you before you can see this child's file.",
  restrictTitle: "Custody limit",
  restrictLead: "Staff at this daycare can limit one parent. Other daycares do not see this.",
  mode: "Limit",
  restrict: "Hide the file and stop pickup",
  block: "Hide the file, stop pickup, and stop messages",
  note: "Note",
  file: "Court order (optional)",
  save: "Save limit",
  lift: "Remove limit",
  staffOnly: "Only this daycare and KidEase admin can see this note.",
  blockedFamily: "This family is blocked. Approve stays off.",
  saved: "Saved",
  bad: "Try that again.",
  errors: {
    off: "Family sharing is off.",
    open: "A second parent is already linked. Remove them before a new invite.",
    member: "Only the main parent can invite.",
    missing: "This invite is not valid.",
    closed: "This invite is no longer open.",
    self: "Open this with the other parent's login.",
    busy: "This login is already linked to a family.",
    expired: "This invite has expired. Ask for a new one.",
    email: "Sign in with the email that received the invite.",
    blocked: "KidEase cannot send this invite.",
    denied: "Only the main parent can change this.",
    email_bad: "Enter a real email address.",
  },
};

const fr: CustodyCopy = {
  title: "Inviter l’autre parent",
  lead: "Cette personne reçoit un courriel et doit accepter avec son propre compte. KidEase n’accepte pas à sa place.",
  emailLabel: "Son courriel",
  send: "Envoyer l’invitation",
  sent: "Invitation envoyée. Cette personne doit accepter.",
  preview: "L’aperçu n’envoie pas ce courriel. La personne peut encore accepter le lien après la connexion.",
  mustAccept: "Cette invitation reste ouverte jusqu’à l’acceptation.",
  waiting: "En attente de l’acceptation.",
  expires: "L’invitation expire dans 7 jours.",
  join: "Accepter avec ce compte",
  remove: "Retirer ce parent",
  verified: "Confirmé par cette garderie",
  notVerified: "Pas encore confirmé",
  confirm: "Confirmer ce parent",
  confirmed: "Confirmé",
  mainParent: "Parent principal",
  otherParent: "Autre parent",
  pickupYes: "Peut venir chercher",
  pickupNo: "Pas autorisé à venir chercher",
  fileLocked: "Une garderie doit vous confirmer avant que vous voyiez le dossier de cet enfant.",
  restrictTitle: "Limite de garde",
  restrictLead: "Le personnel de cette garderie peut limiter un parent. Les autres garderies ne voient pas ceci.",
  mode: "Limite",
  restrict: "Cacher le dossier et bloquer le départ",
  block: "Cacher le dossier, bloquer le départ et les messages",
  note: "Note",
  file: "Ordonnance du tribunal (facultatif)",
  save: "Enregistrer la limite",
  lift: "Retirer la limite",
  staffOnly: "Seuls cette garderie et l’admin KidEase voient cette note.",
  blockedFamily: "Cette famille est bloquée. Approuver reste désactivé.",
  saved: "Enregistré",
  bad: "Réessayez.",
  errors: {
    off: "Le partage familial est désactivé.",
    open: "Un deuxième parent est déjà lié. Retirez-le avant une nouvelle invitation.",
    member: "Seul le parent principal peut inviter.",
    missing: "Cette invitation n’est pas valide.",
    closed: "Cette invitation n’est plus ouverte.",
    self: "Ouvrez ceci avec le compte de l’autre parent.",
    busy: "Ce compte est déjà lié à une famille.",
    expired: "Cette invitation a expiré. Demandez-en une nouvelle.",
    email: "Connectez-vous avec le courriel qui a reçu l’invitation.",
    blocked: "KidEase ne peut pas envoyer cette invitation.",
    denied: "Seul le parent principal peut changer ceci.",
    email_bad: "Entrez une vraie adresse courriel.",
  },
};

export function custodyCopy(locale: string): CustodyCopy {
  return locale === "fr" ? fr : en;
}
