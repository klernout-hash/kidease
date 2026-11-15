export type CentreDocCopy = {
  title: string;
  lead: string;
  score: string;
  missing: string;
  expiring: string;
  expired: string;
  uploaded: string;
  pending: string;
  approved: string;
  rejected: string;
  upload: string;
  replace: string;
  remove: string;
  expiry: string;
  reason: string;
  approve: string;
  reject: string;
  saved: string;
  removed: string;
  notSaved: string;
  handbookNote: string;
  licenceHint: string;
  screeningHint: string;
  badge: string;
  filterAll: string;
  filterMissing: string;
  filterExpiring: string;
  filterPending: string;
  empty: string;
  kinds: Record<string, string>;
};

const en: CentreDocCopy = {
  title: "Documents",
  lead: "Upload the files this centre needs. Parents never see the files. A badge appears only after KidEase approves the licence and insurance.",
  score: "{n}% complete",
  missing: "Missing",
  expiring: "Expiring soon",
  expired: "Expired",
  uploaded: "On file",
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
  upload: "Upload",
  replace: "Replace",
  remove: "Remove",
  expiry: "Expiry date",
  reason: "Reason",
  approve: "Approve",
  reject: "Reject",
  saved: "Saved. The file is waiting for review.",
  removed: "Removed.",
  notSaved: "That file was not saved.",
  handbookNote: "The written note on the listing stays. This checklist also needs the PDF.",
  licenceHint: "The licence scan stays on the licence page.",
  screeningHint: "Staff screening stays on the screening page.",
  badge: "Documents verified",
  filterAll: "All claimed centres",
  filterMissing: "Missing a file",
  filterExpiring: "Expiring or expired",
  filterPending: "Waiting for review",
  empty: "No claimed centre matches this filter.",
  kinds: {
    licence: "Licence",
    insurance: "Liability insurance",
    handbook: "Parent handbook",
    screening: "Staff screening",
    health: "Health policy",
    behaviour: "Behaviour policy",
    emergency: "Emergency policy",
    fees: "Fees policy",
  },
};

const fr: CentreDocCopy = {
  title: "Documents",
  lead: "Téléversez les fichiers de ce centre. Les parents ne voient jamais les fichiers. Un badge apparaît seulement après l’approbation de la licence et de l’assurance.",
  score: "{n} % complet",
  missing: "Manquant",
  expiring: "Expire bientôt",
  expired: "Expiré",
  uploaded: "Au dossier",
  pending: "En attente de révision",
  approved: "Approuvé",
  rejected: "Refusé",
  upload: "Téléverser",
  replace: "Remplacer",
  remove: "Retirer",
  expiry: "Date d’expiration",
  reason: "Raison",
  approve: "Approuver",
  reject: "Refuser",
  saved: "Enregistré. Le fichier attend une révision.",
  removed: "Retiré.",
  notSaved: "Ce fichier n’a pas été enregistré.",
  handbookNote: "La note écrite sur la fiche reste. Cette liste demande aussi le PDF.",
  licenceHint: "Le scan de la licence reste sur la page de la licence.",
  screeningHint: "Le filtrage du personnel reste sur la page de filtrage.",
  badge: "Documents vérifiés",
  filterAll: "Tous les centres revendiqués",
  filterMissing: "Fichier manquant",
  filterExpiring: "Expire ou expiré",
  filterPending: "En attente de révision",
  empty: "Aucun centre revendiqué ne correspond.",
  kinds: {
    licence: "Permis",
    insurance: "Assurance responsabilité",
    handbook: "Guide des parents",
    screening: "Filtrage du personnel",
    health: "Politique de santé",
    behaviour: "Politique de comportement",
    emergency: "Politique d’urgence",
    fees: "Politique des frais",
  },
};

export function centreDocCopy(locale: string): CentreDocCopy {
  return locale === "fr" ? fr : en;
}
