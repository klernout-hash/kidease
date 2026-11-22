/**
 * English and French words for the staff job board. Every key exists in both.
 * scripts/staff-jobs.test.mjs checks parity. Grade-6 words, short sentences.
 */

import {
  certLevelLabel,
  type ApplicationStage,
  type CareGroup,
  type ExpiryState,
  type JobError,
  type MatchFlag,
  type MatchReason,
  type MatchResult,
  type ProfileError,
  type ProvinceCode,
  type StaffDay,
  type StaffLanguage,
  type StaffShift,
  type StaffVisibility,
  type VettingHint,
  type VettingItem,
  type VettingState,
  type WorkType,
} from "./staff-jobs.ts";

export type StaffJobsLocale = "en" | "fr";

const EN = {
  // Staff side, first screen
  kicker: "Jobs in child care",
  title: "Find a daycare job near you",
  lead: "Make one profile. See jobs that fit your papers, your days and your area. Apply with one tap.",
  privacyLead: "Daycares see only your first name, level, area, days and highlights until you apply or say yes to an invite.",
  startProfile: "Make my profile",
  signInToStart: "Sign in to make your profile",
  editProfile: "Edit my profile",
  // Profile steps
  stepOf: "Step {n} of {total}",
  next: "Next",
  back: "Back",
  save: "Save my profile",
  saved: "Your profile is saved.",
  saveFailed: "We could not save. Check your internet and try again.",
  stepName: "Your name",
  stepNameHint: "Daycares see your first name. Your last name shows only after you apply.",
  firstName: "First name",
  lastName: "Last name",
  stepPapers: "Your papers",
  stepPapersHint: "Pick the province that gave your certificate.",
  province: "Province",
  pickProvince: "Pick a province",
  certLevel: "Certificate level",
  noCert: "No certificate yet",
  certExpires: "Certificate good until",
  firstAidExpires: "First aid and CPR good until",
  dateHint: "Leave blank if you do not know.",
  years: "Years working with children",
  stepWork: "Your work",
  stepWorkHint: "Pick all that fit.",
  careGroups: "Rooms you work in",
  days: "Days you can work",
  shifts: "Times of day",
  workTypes: "Kind of job",
  startDate: "Date you can start",
  stepWhere: "Where you want to work",
  stepWhereHint: "We use your city to show how far a job is. We never show your street.",
  city: "City or town",
  postalCode: "Postal code (optional)",
  postalHint: "Only daycares you apply to can see it.",
  radius: "How far you will travel",
  km: "{n} km",
  stepShare: "What daycares see",
  stepShareHint: "You choose who can find you.",
  languages: "Languages you speak",
  languagesHint: "Shown on your full profile. Not used to rank you.",
  highlights: "One line about you",
  highlightsHint: "For example: Calm with toddlers. Loves outdoor play.",
  phone: "Phone (optional)",
  resume: "Resume (optional)",
  resumeHint: "PDF or photo, under 4 MB. Private. Only daycares you apply to can open it.",
  resumeAdd: "Add a resume",
  resumeOnFile: "Resume on file",
  resumeOpen: "Open my resume",
  resumeSaved: "Resume saved.",
  resumeSaveProfileFirst: "Save your profile first, then add a resume.",
  visibility: "Who can find you",
  visibilityOpen: "Daycares with a job that fits can see my short profile",
  visibilityApplied: "Only daycares I apply to",
  visibilityPaused: "Pause. No one new can see me",
  hideFromEmployer: "Hide me from the daycare I work at now",
  // Matches
  matchesTitle: "Jobs that fit you",
  matchesEmpty: "No jobs fit yet.",
  matchesEmptyBody: "New jobs show up here. You can widen your area or add more days.",
  widenArea: "Change my area",
  noJobsYet: "No jobs are posted yet.",
  noJobsYetBody: "Daycares are just starting to post. Your profile is ready when they do.",
  apply: "Apply",
  applied: "Applied",
  appliedNote: "Sent. The daycare can now see your full profile.",
  applyFailed: "We could not send it. Try again.",
  whyFits: "Why it fits",
  toTalkAbout: "To talk about",
  pay: "${min} to ${max} an hour",
  starts: "Starts {date}",
  // Applications
  myApplications: "My applications",
  noApplications: "You have not applied yet.",
  noApplicationsBody: "Pick a job above and tap Apply.",
  invitesTitle: "Daycares that invited you",
  inviteAccept: "Say yes",
  inviteDecline: "No thanks",
  inviteAccepted: "Done. The daycare can now see your full profile.",
  joinTeam: "Join the team",
  joinedTeam: "You joined the team.",
  // Stages
  stage_applied: "Applied",
  stage_viewed: "Seen by the daycare",
  stage_interview: "Interview",
  stage_offer: "Job offer",
  stage_hired: "Hired",
  stage_not_selected: "Not picked this time",
  // Law 25
  automatedTitle: "How matching works",
  automatedBody: "A computer sorts jobs and people with fixed rules: papers, distance, days, times, rooms, kind of job, years and start date. It never uses age, gender, family, religion, background, health, language or other personal traits. The daycare makes every choice.",
  humanReview: "Ask a person to review",
  humanReviewBody: "Want a person to look at a match? Tell us here or write to privacy@kidease.ca.",
  humanReviewPlaceholder: "What should we look at?",
  humanReviewSend: "Send to KidEase",
  humanReviewSent: "Thanks. A person at KidEase will reply within 30 days.",
  // Provider side
  hireKicker: "For daycares",
  hireTitle: "Hire ECEs and staff",
  hireLead: "Post a job in 3 short steps. See people who fit, with plain reasons. You decide every step.",
  hirePrivacy: "You see a short profile first. Full name, contact and resume show once a person applies or says yes to your invite.",
  postJob: "Post a job",
  signInToHire: "Sign in to post a job",
  claimToHire: "Claim your daycare to post jobs",
  jobStepRole: "The role",
  jobStepSchedule: "Days and pay",
  jobStepCentre: "About your daycare",
  centre: "Daycare",
  jobTitle: "Job title",
  jobTitleHint: "For example: Toddler room ECE",
  certNeeded: "Level needed",
  anyLevel: "Any level, or no certificate",
  payMin: "Pay from ($ an hour)",
  payMax: "Pay to ($ an hour)",
  payHint: "A pay range is required in some provinces. It helps people decide.",
  about: "About your daycare",
  aboutHint: "What is it like to work there? Team, rooms, perks.",
  publish: "Post the job",
  published: "Your job is posted.",
  publishFailed: "We could not post it. Check the steps and try again.",
  myJobs: "Your jobs",
  noPosts: "You have no jobs posted.",
  noPostsBody: "Post your first job. It takes about 3 minutes.",
  applicants: "People who applied",
  applicantsCount: "{n} applied",
  noApplicants: "No one has applied yet.",
  noApplicantsBody: "Look at people who fit below and invite them to apply.",
  suggested: "People who fit this job",
  noSuggested: "No one fits yet.",
  noSuggestedBody: "Try a wider schedule or any level. New profiles show up here.",
  invite: "Invite to apply",
  invited: "Invited",
  inviteSent: "Invite saved. They see it next time they open KidEase.",
  shortProfile: "Short profile",
  shortProfileNote: "Full name, contact and resume show if they apply or say yes.",
  fullProfile: "Full profile",
  openApplicant: "Open",
  closeJob: "Close this job",
  reopenJob: "Open this job again",
  closed: "Closed",
  open: "Open",
  stageLabel: "Step",
  stageSaved: "Saved. They can see the new step.",
  stageHelp: "You choose every step. KidEase never turns anyone down for you.",
  hireInvite: "Hire and add to my team",
  hireInviteDone: "Hired. They can join your team from their KidEase page.",
  hireInviteHint: "This uses your staff invite. No email or text is sent.",
  email: "Email",
  phoneLabel: "Phone",
  postal: "Postal code",
  experience: "Experience",
  speaks: "Speaks",
  // Vetting
  vettingTitle: "Your checklist",
  vettingHelp: "Tick each line when you have checked it yourself.",
  vetting_certificate: "Certificate on file and not expired",
  vetting_first_aid: "First aid and CPR",
  vetting_background_check: "Background check",
  vetting_references: "References",
  vstate_to_do: "To do",
  vstate_checked: "Checked",
  vstate_not_needed: "Not needed",
  vhint_on_file: "On their profile, good until {date}",
  vhint_expires_soon: "Ends soon: {date}",
  vhint_expired: "Expired {date}. Ask for a new one.",
  vhint_missing: "Not on their profile. Ask for it.",
  vhint_record_found: "On file in your background-check records",
  vhint_record_expired: "Your record has expired",
  vhint_no_record: "No record in your background-check records yet",
  vhint_records_off: "Ask for a recent check. Follow your province's rules.",
  vhint_ask: "Ask for two people who know their work.",
  vettingNote: "Note (only your team sees it)",
  vettingSaved: "Checklist saved.",
  // Flags
  flag_cert_expired: "Certificate expired",
  flag_first_aid_expired: "First aid expired",
  flag_cert_missing_date: "No end date on certificate",
  // Errors
  err_first_name: "Add your first name.",
  err_last_name: "Add your last name.",
  err_province: "Pick a province.",
  err_cert_date: "Add the date your certificate ends.",
  err_days: "Pick at least one day.",
  err_work_type: "Pick at least one kind of job.",
  err_city: "Add your city or town.",
  err_postal_code: "That postal code does not look right. Try A1A 1A1.",
  err_centre: "Pick your daycare.",
  err_title: "Add a job title.",
  err_pay: "Add pay between $15 and $80 an hour.",
  err_pay_order: "The first number should be the lower one.",
  err_about: "Add a few words about your daycare.",
  signInFirst: "Sign in first.",
  off: "The job board is not open yet.",
  help: "Help",
  findJobsLink: "Find jobs",
  hireLink: "Hire staff",
} as const;

export type StaffJobsCopyKey = keyof typeof EN;

const FR: Record<StaffJobsCopyKey, string> = {
  kicker: "Emplois en services de garde",
  title: "Trouvez un emploi en garderie près de chez vous",
  lead: "Faites un seul profil. Voyez les emplois qui vont avec vos papiers, vos jours et votre secteur. Postulez en un geste.",
  privacyLead: "Les garderies voient seulement votre prénom, votre niveau, votre secteur, vos jours et vos points forts, jusqu’à ce que vous postuliez ou acceptiez une invitation.",
  startProfile: "Faire mon profil",
  signInToStart: "Connectez-vous pour faire votre profil",
  editProfile: "Modifier mon profil",
  stepOf: "Étape {n} sur {total}",
  next: "Suivant",
  back: "Retour",
  save: "Enregistrer mon profil",
  saved: "Votre profil est enregistré.",
  saveFailed: "Impossible d’enregistrer. Vérifiez votre connexion et réessayez.",
  stepName: "Votre nom",
  stepNameHint: "Les garderies voient votre prénom. Votre nom de famille apparaît seulement si vous postulez.",
  firstName: "Prénom",
  lastName: "Nom de famille",
  stepPapers: "Vos papiers",
  stepPapersHint: "Choisissez la province qui a donné votre certificat.",
  province: "Province",
  pickProvince: "Choisir une province",
  certLevel: "Niveau du certificat",
  noCert: "Pas encore de certificat",
  certExpires: "Certificat valide jusqu’au",
  firstAidExpires: "Premiers soins et RCR valides jusqu’au",
  dateHint: "Laissez vide si vous ne savez pas.",
  years: "Années de travail avec des enfants",
  stepWork: "Votre travail",
  stepWorkHint: "Choisissez tout ce qui s’applique.",
  careGroups: "Groupes où vous travaillez",
  days: "Jours où vous pouvez travailler",
  shifts: "Moments de la journée",
  workTypes: "Type d’emploi",
  startDate: "Date où vous pouvez commencer",
  stepWhere: "Où vous voulez travailler",
  stepWhereHint: "Votre ville sert à montrer la distance d’un emploi. Nous ne montrons jamais votre rue.",
  city: "Ville ou village",
  postalCode: "Code postal (facultatif)",
  postalHint: "Seules les garderies où vous postulez peuvent le voir.",
  radius: "Distance que vous acceptez de parcourir",
  km: "{n} km",
  stepShare: "Ce que les garderies voient",
  stepShareHint: "Vous choisissez qui peut vous trouver.",
  languages: "Langues que vous parlez",
  languagesHint: "Affiché sur votre profil complet. Ne sert pas à vous classer.",
  highlights: "Une ligne sur vous",
  highlightsHint: "Par exemple : Calme avec les trottineurs. Adore jouer dehors.",
  phone: "Téléphone (facultatif)",
  resume: "CV (facultatif)",
  resumeHint: "PDF ou photo, moins de 4 Mo. Privé. Seules les garderies où vous postulez peuvent l’ouvrir.",
  resumeAdd: "Ajouter un CV",
  resumeOnFile: "CV au dossier",
  resumeOpen: "Ouvrir mon CV",
  resumeSaved: "CV enregistré.",
  resumeSaveProfileFirst: "Enregistrez d’abord votre profil, puis ajoutez un CV.",
  visibility: "Qui peut vous trouver",
  visibilityOpen: "Les garderies avec un emploi qui me convient peuvent voir mon profil court",
  visibilityApplied: "Seulement les garderies où je postule",
  visibilityPaused: "Pause. Personne de nouveau ne peut me voir",
  hideFromEmployer: "Me cacher de la garderie où je travaille maintenant",
  matchesTitle: "Emplois qui vous conviennent",
  matchesEmpty: "Aucun emploi ne convient pour le moment.",
  matchesEmptyBody: "Les nouveaux emplois apparaîtront ici. Vous pouvez agrandir votre secteur ou ajouter des jours.",
  widenArea: "Changer mon secteur",
  noJobsYet: "Aucun emploi n’est publié pour le moment.",
  noJobsYetBody: "Les garderies commencent à publier. Votre profil sera prêt quand elles le feront.",
  apply: "Postuler",
  applied: "Candidature envoyée",
  appliedNote: "Envoyé. La garderie peut maintenant voir votre profil complet.",
  applyFailed: "Impossible d’envoyer. Réessayez.",
  whyFits: "Pourquoi ça convient",
  toTalkAbout: "À discuter",
  pay: "{min} $ à {max} $ de l’heure",
  starts: "Début le {date}",
  myApplications: "Mes candidatures",
  noApplications: "Vous n’avez pas encore postulé.",
  noApplicationsBody: "Choisissez un emploi plus haut et touchez Postuler.",
  invitesTitle: "Garderies qui vous ont invitée",
  inviteAccept: "Accepter",
  inviteDecline: "Non merci",
  inviteAccepted: "C’est fait. La garderie peut maintenant voir votre profil complet.",
  joinTeam: "Rejoindre l’équipe",
  joinedTeam: "Vous faites partie de l’équipe.",
  stage_applied: "Candidature envoyée",
  stage_viewed: "Vue par la garderie",
  stage_interview: "Entrevue",
  stage_offer: "Offre d’emploi",
  stage_hired: "Embauchée",
  stage_not_selected: "Pas retenue cette fois",
  automatedTitle: "Comment fonctionne le jumelage",
  automatedBody: "Un ordinateur trie les emplois et les personnes avec des règles fixes : papiers, distance, jours, heures, groupes, type d’emploi, années et date de début. Il n’utilise jamais l’âge, le genre, la famille, la religion, l’origine, la santé, la langue ni d’autres traits personnels. La garderie fait chaque choix.",
  humanReview: "Demander l’avis d’une personne",
  humanReviewBody: "Vous voulez qu’une personne regarde un jumelage? Dites-le ici ou écrivez à privacy@kidease.ca.",
  humanReviewPlaceholder: "Que devons-nous regarder?",
  humanReviewSend: "Envoyer à KidEase",
  humanReviewSent: "Merci. Une personne de KidEase vous répondra d’ici 30 jours.",
  hireKicker: "Pour les garderies",
  hireTitle: "Embauchez des éducatrices et du personnel",
  hireLead: "Publiez un emploi en 3 petites étapes. Voyez les personnes qui conviennent, avec des raisons claires. Vous décidez de chaque étape.",
  hirePrivacy: "Vous voyez d’abord un profil court. Le nom complet, les coordonnées et le CV apparaissent quand la personne postule ou accepte votre invitation.",
  postJob: "Publier un emploi",
  signInToHire: "Connectez-vous pour publier un emploi",
  claimToHire: "Réclamez votre garderie pour publier des emplois",
  jobStepRole: "Le poste",
  jobStepSchedule: "Jours et salaire",
  jobStepCentre: "Votre garderie",
  centre: "Garderie",
  jobTitle: "Titre du poste",
  jobTitleHint: "Par exemple : Éducatrice, groupe des trottineurs",
  certNeeded: "Niveau demandé",
  anyLevel: "Tout niveau, ou sans certificat",
  payMin: "Salaire de ($ de l’heure)",
  payMax: "Salaire jusqu’à ($ de l’heure)",
  payHint: "Certaines provinces exigent une fourchette de salaire. Elle aide les gens à décider.",
  about: "À propos de votre garderie",
  aboutHint: "Comment est-ce d’y travailler? Équipe, groupes, avantages.",
  publish: "Publier l’emploi",
  published: "Votre emploi est publié.",
  publishFailed: "Impossible de publier. Vérifiez les étapes et réessayez.",
  myJobs: "Vos emplois",
  noPosts: "Vous n’avez aucun emploi publié.",
  noPostsBody: "Publiez votre premier emploi. Cela prend environ 3 minutes.",
  applicants: "Personnes qui ont postulé",
  applicantsCount: "{n} candidatures",
  noApplicants: "Personne n’a encore postulé.",
  noApplicantsBody: "Regardez les personnes qui conviennent plus bas et invitez-les à postuler.",
  suggested: "Personnes qui conviennent à cet emploi",
  noSuggested: "Personne ne convient pour le moment.",
  noSuggestedBody: "Essayez un horaire plus large ou tout niveau. Les nouveaux profils apparaîtront ici.",
  invite: "Inviter à postuler",
  invited: "Invitée",
  inviteSent: "Invitation enregistrée. La personne la verra à sa prochaine visite sur KidEase.",
  shortProfile: "Profil court",
  shortProfileNote: "Le nom complet, les coordonnées et le CV apparaissent si la personne postule ou accepte.",
  fullProfile: "Profil complet",
  openApplicant: "Ouvrir",
  closeJob: "Fermer cet emploi",
  reopenJob: "Rouvrir cet emploi",
  closed: "Fermé",
  open: "Ouvert",
  stageLabel: "Étape",
  stageSaved: "Enregistré. La personne voit la nouvelle étape.",
  stageHelp: "Vous choisissez chaque étape. KidEase ne refuse jamais personne à votre place.",
  hireInvite: "Embaucher et ajouter à mon équipe",
  hireInviteDone: "Embauchée. La personne peut rejoindre votre équipe depuis sa page KidEase.",
  hireInviteHint: "Ceci utilise votre invitation du personnel. Aucun courriel ni texto n’est envoyé.",
  email: "Courriel",
  phoneLabel: "Téléphone",
  postal: "Code postal",
  experience: "Expérience",
  speaks: "Parle",
  vettingTitle: "Votre liste de vérification",
  vettingHelp: "Cochez chaque ligne une fois que vous l’avez vérifiée vous-même.",
  vetting_certificate: "Certificat au dossier et non expiré",
  vetting_first_aid: "Premiers soins et RCR",
  vetting_background_check: "Vérification des antécédents",
  vetting_references: "Références",
  vstate_to_do: "À faire",
  vstate_checked: "Vérifié",
  vstate_not_needed: "Pas nécessaire",
  vhint_on_file: "Sur son profil, valide jusqu’au {date}",
  vhint_expires_soon: "Se termine bientôt : {date}",
  vhint_expired: "Expiré le {date}. Demandez-en un nouveau.",
  vhint_missing: "Pas sur son profil. Demandez-le.",
  vhint_record_found: "Au dossier dans vos vérifications d’antécédents",
  vhint_record_expired: "Votre dossier est expiré",
  vhint_no_record: "Aucun dossier dans vos vérifications d’antécédents pour l’instant",
  vhint_records_off: "Demandez une vérification récente. Suivez les règles de votre province.",
  vhint_ask: "Demandez deux personnes qui connaissent son travail.",
  vettingNote: "Note (visible par votre équipe seulement)",
  vettingSaved: "Liste enregistrée.",
  flag_cert_expired: "Certificat expiré",
  flag_first_aid_expired: "Premiers soins expirés",
  flag_cert_missing_date: "Aucune date de fin sur le certificat",
  err_first_name: "Ajoutez votre prénom.",
  err_last_name: "Ajoutez votre nom de famille.",
  err_province: "Choisissez une province.",
  err_cert_date: "Ajoutez la date de fin de votre certificat.",
  err_days: "Choisissez au moins un jour.",
  err_work_type: "Choisissez au moins un type d’emploi.",
  err_city: "Ajoutez votre ville ou village.",
  err_postal_code: "Ce code postal ne semble pas valide. Essayez A1A 1A1.",
  err_centre: "Choisissez votre garderie.",
  err_title: "Ajoutez un titre de poste.",
  err_pay: "Indiquez un salaire entre 15 $ et 80 $ de l’heure.",
  err_pay_order: "Le premier nombre doit être le plus petit.",
  err_about: "Ajoutez quelques mots sur votre garderie.",
  signInFirst: "Connectez-vous d’abord.",
  off: "Le tableau d’emplois n’est pas encore ouvert.",
  help: "Aide",
  findJobsLink: "Trouver un emploi",
  hireLink: "Embaucher du personnel",
};

export const STAFF_JOBS_COPY: Record<StaffJobsLocale, Record<StaffJobsCopyKey, string>> = { en: EN, fr: FR };

export function staffJobsLocale(locale: string | null | undefined): StaffJobsLocale {
  return locale === "fr" ? "fr" : "en";
}

export function sj(locale: StaffJobsLocale, key: StaffJobsCopyKey, vars: Record<string, string | number> = {}): string {
  const text = STAFF_JOBS_COPY[locale][key] ?? STAFF_JOBS_COPY.en[key];
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

const DAY_WORDS: Record<StaffJobsLocale, Record<StaffDay, string>> = {
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  fr: { mon: "lun", tue: "mar", wed: "mer", thu: "jeu", fri: "ven", sat: "sam", sun: "dim" },
};

const SHIFT_WORDS: Record<StaffJobsLocale, Record<StaffShift, string>> = {
  en: { morning: "mornings", afternoon: "afternoons", full_day: "full days", evening: "evenings" },
  fr: { morning: "matins", afternoon: "après-midi", full_day: "journées complètes", evening: "soirs" },
};

const CARE_WORDS: Record<StaffJobsLocale, Record<CareGroup, string>> = {
  en: { infant: "babies", toddler: "toddlers", preschool: "preschoolers", school_age: "school-age kids" },
  fr: { infant: "poupons", toddler: "trottineurs", preschool: "enfants d’âge préscolaire", school_age: "enfants d’âge scolaire" },
};

const WORK_WORDS: Record<StaffJobsLocale, Record<WorkType, string>> = {
  en: { full_time: "full time", part_time: "part time", casual: "casual or on call" },
  fr: { full_time: "temps plein", part_time: "temps partiel", casual: "occasionnel ou sur appel" },
};

const LANGUAGE_WORDS: Record<StaffJobsLocale, Record<StaffLanguage, string>> = {
  en: { en: "English", fr: "French", es: "Spanish", pa: "Punjabi", zh: "Chinese", ar: "Arabic", tl: "Tagalog", it: "Italian", de: "German", other: "Other" },
  fr: { en: "anglais", fr: "français", es: "espagnol", pa: "pendjabi", zh: "chinois", ar: "arabe", tl: "tagalog", it: "italien", de: "allemand", other: "autre" },
};

const PROVINCE_WORDS: Record<StaffJobsLocale, Record<ProvinceCode, string>> = {
  en: {
    AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador",
    NS: "Nova Scotia", NT: "Northwest Territories", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island",
    QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
  },
  fr: {
    AB: "Alberta", BC: "Colombie-Britannique", MB: "Manitoba", NB: "Nouveau-Brunswick", NL: "Terre-Neuve-et-Labrador",
    NS: "Nouvelle-Écosse", NT: "Territoires du Nord-Ouest", NU: "Nunavut", ON: "Ontario", PE: "Île-du-Prince-Édouard",
    QC: "Québec", SK: "Saskatchewan", YT: "Yukon",
  },
};

export const dayWord = (l: StaffJobsLocale, d: StaffDay) => DAY_WORDS[l][d];
export const shiftWord = (l: StaffJobsLocale, s: StaffShift) => SHIFT_WORDS[l][s];
export const careWord = (l: StaffJobsLocale, g: CareGroup) => CARE_WORDS[l][g];
export const workWord = (l: StaffJobsLocale, w: WorkType) => WORK_WORDS[l][w];
export const languageWord = (l: StaffJobsLocale, x: StaffLanguage) => LANGUAGE_WORDS[l][x];
export const provinceWord = (l: StaffJobsLocale, p: ProvinceCode) => PROVINCE_WORDS[l][p];
export const stageWord = (l: StaffJobsLocale, s: ApplicationStage) => sj(l, `stage_${s}` as StaffJobsCopyKey);
export const flagWord = (l: StaffJobsLocale, f: MatchFlag) => sj(l, `flag_${f}` as StaffJobsCopyKey);
export const vettingItemWord = (l: StaffJobsLocale, i: VettingItem) => sj(l, `vetting_${i}` as StaffJobsCopyKey);
export const vettingStateWord = (l: StaffJobsLocale, s: VettingState) => sj(l, `vstate_${s}` as StaffJobsCopyKey);
export const vettingHintWord = (l: StaffJobsLocale, h: VettingHint, date: string | null) =>
  sj(l, `vhint_${h}` as StaffJobsCopyKey, { date: date ?? "" });
export const profileErrorWord = (l: StaffJobsLocale, e: ProfileError) => sj(l, `err_${e}` as StaffJobsCopyKey);
export const jobErrorWord = (l: StaffJobsLocale, e: JobError) => sj(l, `err_${e}` as StaffJobsCopyKey);
export const visibilityWord = (l: StaffJobsLocale, v: StaffVisibility) =>
  sj(l, v === "open" ? "visibilityOpen" : v === "applied_only" ? "visibilityApplied" : "visibilityPaused");

export function expiryWord(l: StaffJobsLocale, state: ExpiryState): string {
  if (state === "expired") return l === "fr" ? "expiré" : "expired";
  if (state === "soon") return l === "fr" ? "se termine bientôt" : "ends soon";
  if (state === "missing") return l === "fr" ? "pas de date" : "no date";
  return l === "fr" ? "valide" : "valid";
}

function listWords(l: StaffJobsLocale, words: string[]): string {
  if (words.length <= 1) return words.join("");
  const last = words[words.length - 1];
  return `${words.slice(0, -1).join(", ")} ${l === "fr" ? "et" : "and"} ${last}`;
}

/** One reason in plain words. */
export function reasonWords(l: StaffJobsLocale, reason: MatchReason): string {
  const fr = l === "fr";
  switch (reason.code) {
    case "cert_meets":
      return certLevelLabel(reason.level, l);
    case "cert_other_province":
      return fr
        ? `Certificat de ${provinceWord(l, reason.province)} : demander le transfert`
        : `Certified in ${provinceWord(l, reason.province)}: ask about transfer`;
    case "cert_below":
      return fr
        ? `${certLevelLabel(reason.level, l)} (l’emploi demande ${certLevelLabel(reason.needed, l)})`
        : `${certLevelLabel(reason.level, l)} (job asks for ${certLevelLabel(reason.needed, l)})`;
    case "cert_missing":
      return fr ? `L’emploi demande ${certLevelLabel(reason.needed, l)}` : `Job asks for ${certLevelLabel(reason.needed, l)}`;
    case "cert_not_needed":
      return fr ? "Aucun certificat demandé" : "No certificate needed";
    case "cert_expired":
      return fr ? `${certLevelLabel(reason.level, l)} expiré` : `${certLevelLabel(reason.level, l)} expired`;
    case "distance":
      return fr ? `${reason.km} km` : `${reason.km} km away`;
    case "distance_far":
      return fr ? `${reason.km} km, hors du secteur choisi` : `${reason.km} km, outside their area`;
    case "days_all":
      if (reason.weekdays) return fr ? "disponible en semaine" : "available weekdays";
      return fr
        ? `disponible ${listWords(l, reason.days.map((d) => dayWord(l, d)))}`
        : `available ${listWords(l, reason.days.map((d) => dayWord(l, d)))}`;
    case "days_some":
      return fr ? `disponible ${reason.have} jours sur ${reason.need}` : `available ${reason.have} of ${reason.need} days`;
    case "days_none":
      return fr ? "pas disponible les jours demandés" : "not free on the job's days";
    case "shifts":
      return fr
        ? `travaille les ${listWords(l, reason.shifts.map((s) => shiftWord(l, s)))}`
        : `works ${listWords(l, reason.shifts.map((s) => shiftWord(l, s)))}`;
    case "shifts_none":
      return fr ? "autres heures que celles demandées" : "different times of day";
    case "care_groups":
      return fr
        ? `travaille avec les ${listWords(l, reason.groups.map((g) => careWord(l, g)))}`
        : `works with ${listWords(l, reason.groups.map((g) => careWord(l, g)))}`;
    case "care_groups_none":
      return fr ? "pas encore travaillé avec ce groupe" : "has not worked with this room yet";
    case "work_type":
      return fr ? `veut un emploi à ${workWord(l, reason.workType)}` : `wants ${workWord(l, reason.workType)}`;
    case "work_type_other":
      return fr ? `préfère ${workWord(l, reason.workType)}` : `prefers ${workWord(l, reason.workType)}`;
    case "experience":
      return fr
        ? `${reason.years} an${reason.years > 1 ? "s" : ""} d’expérience`
        : `${reason.years} year${reason.years > 1 ? "s" : ""} of experience`;
    case "start_late":
      return fr ? `peut commencer le ${reason.date}` : `can start ${reason.date}`;
    case "first_aid_expired":
      return fr ? "premiers soins expirés" : "first aid expired";
    case "first_aid_missing":
      return fr ? "pas de date de premiers soins" : "no first aid date";
  }
}

/** "ECE II · 4 km away · available weekdays · works with toddlers" */
export function explainMatch(l: StaffJobsLocale, result: Pick<MatchResult, "good" | "check">): { good: string; check: string } {
  return {
    good: result.good.map((r) => reasonWords(l, r)).filter(Boolean).join(" · "),
    check: result.check.map((r) => reasonWords(l, r)).filter(Boolean).join(" · "),
  };
}

export function payWords(l: StaffJobsLocale, minCents: number | null, maxCents: number | null): string {
  if (minCents === null || maxCents === null) return "";
  const fmt = (cents: number) => {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2).replace(".", l === "fr" ? "," : ".");
  };
  return sj(l, "pay", { min: fmt(minCents), max: fmt(maxCents) });
}
