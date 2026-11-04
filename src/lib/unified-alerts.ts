/**
 * Unified KidEase alerts. Pure rules: registry, toggles, quiet hours, dedupe.
 * scripts/unified-alerts.test.mjs loads this file in Node. No database.
 *
 * Device push still needs the existing FEATURE_PUSH path. This module never
 * turns on FEATURE_CALL_PUSH and never sends SMS. Email for types that
 * already have a mailer stays on that mailer (emailOwner "legacy").
 */

import { isValidTimeZone } from "./family-time.ts";

export const UNIFIED_ALERTS_FLAG = "FEATURE_UNIFIED_ALERTS";
export const UNIFIED_ALERTS_LIVE_FLAG = "FEATURE_UNIFIED_ALERTS_LIVE";

export const UNIFIED_AUDIENCES = ["parent", "daycare", "staff", "admin"] as const;
export type UnifiedAudience = (typeof UNIFIED_AUDIENCES)[number];

export const UNIFIED_CHANNELS = ["in_app", "email", "push"] as const;
export type UnifiedChannel = (typeof UNIFIED_CHANNELS)[number];

export const DIGEST_MODES = ["off", "daily", "weekly"] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

export type AlertReadiness = "live" | "partial" | "hook" | "stub";
export type EmailOwner = "unified" | "legacy" | "none";
export type AlertLocale = "en" | "fr";

export type AlertCopy = { label: string; detail: string; title: string; body: string };

export type UnifiedAlertType = {
  id: string;
  audience: UnifiedAudience;
  readiness: AlertReadiness;
  emailOwner: EmailOwner;
  critical: boolean;
  digestable: boolean;
  webOnly: boolean;
  /** Skip when a safety_blocks row covers the recipient and the other party. */
  respectBlocks: boolean;
  legacyCategory?: string;
  /** Shown in the pass/fail chart. Plain words. */
  note: string;
  en: AlertCopy;
  fr: AlertCopy;
};

const parent = (
  id: string,
  readiness: AlertReadiness,
  emailOwner: EmailOwner,
  note: string,
  en: AlertCopy,
  fr: AlertCopy,
  extra?: Partial<UnifiedAlertType>,
): UnifiedAlertType => ({
  id,
  audience: "parent",
  readiness,
  emailOwner,
  critical: false,
  digestable: true,
  webOnly: false,
  respectBlocks: true,
  note,
  en,
  fr,
  ...extra,
});

const daycare = (
  id: string,
  readiness: AlertReadiness,
  emailOwner: EmailOwner,
  note: string,
  en: AlertCopy,
  fr: AlertCopy,
  extra?: Partial<UnifiedAlertType>,
): UnifiedAlertType => ({
  id,
  audience: "daycare",
  readiness,
  emailOwner,
  critical: false,
  digestable: true,
  webOnly: false,
  respectBlocks: true,
  note,
  en,
  fr,
  ...extra,
});

const staff = (
  id: string,
  readiness: AlertReadiness,
  emailOwner: EmailOwner,
  note: string,
  critical: boolean,
  en: AlertCopy,
  fr: AlertCopy,
  extra?: Partial<UnifiedAlertType>,
): UnifiedAlertType => ({
  id,
  audience: "staff",
  readiness,
  emailOwner,
  critical,
  digestable: !critical,
  webOnly: false,
  respectBlocks: true,
  note,
  en,
  fr,
  ...extra,
});

export const UNIFIED_ALERT_TYPES: readonly UnifiedAlertType[] = [
  parent(
    "parent_spot_opened",
    "partial",
    "legacy",
    "In-app when a saved or waitlisted centre confirms spots. Email stays on the existing open-spot mailer.",
    { label: "Spot opened", detail: "A centre you saved, or a waitlist, confirms an opening.", title: "A spot may be open", body: "{name} confirmed an opening. Check with the centre." },
    { label: "Place ouverte", detail: "Un centre enregistré, ou une liste d'attente, confirme une place.", title: "Une place pourrait être ouverte", body: "{name} a confirmé une place. Vérifiez avec le centre." },
    { legacyCategory: "spot_opened", critical: true, digestable: false },
  ),
  parent(
    "parent_request_accepted",
    "live",
    "unified",
    "Lead confirmed, tour accepted, or booking accepted.",
    { label: "Request accepted", detail: "A centre accepts a request, a visit, or an enrolment.", title: "Request accepted", body: "{name} accepted your request." },
    { label: "Demande acceptée", detail: "Un centre accepte une demande, une visite ou une inscription.", title: "Demande acceptée", body: "{name} a accepté votre demande." },
    { critical: true, digestable: false },
  ),
  parent(
    "parent_request_declined",
    "live",
    "unified",
    "Lead, tour, or booking declined.",
    { label: "Request declined", detail: "A centre declines a request, a visit, or an enrolment.", title: "Request declined", body: "{name} declined your request." },
    { label: "Demande refusée", detail: "Un centre refuse une demande, une visite ou une inscription.", title: "Demande refusée", body: "{name} a refusé votre demande." },
    { critical: true, digestable: false },
  ),
  parent(
    "parent_request_needs_info",
    "partial",
    "unified",
    "There is no needs-info status. A note on an answered request is the signal.",
    { label: "Centre needs a detail", detail: "A centre sends a note on your request.", title: "The centre sent a note", body: "{name} sent a note on your request." },
    { label: "Le centre demande un détail", detail: "Un centre envoie une note sur votre demande.", title: "Le centre a envoyé une note", body: "{name} a envoyé une note sur votre demande." },
  ),
  parent(
    "parent_tour_day",
    "partial",
    "unified",
    "Day-before reminder only when the visit is booked on a tour window with a start time.",
    { label: "Visit tomorrow", detail: "A reminder the day before a booked visit.", title: "Visit tomorrow", body: "Your visit at {name} is tomorrow." },
    { label: "Visite demain", detail: "Un rappel la veille d'une visite réservée.", title: "Visite demain", body: "Votre visite à {name} est demain." },
  ),
  parent(
    "parent_tour_hour",
    "partial",
    "unified",
    "One-hour reminder only when the visit has a start time.",
    { label: "Visit in one hour", detail: "A reminder about one hour before a booked visit.", title: "Visit in one hour", body: "Your visit at {name} is in about one hour." },
    { label: "Visite dans une heure", detail: "Un rappel environ une heure avant une visite réservée.", title: "Visite dans une heure", body: "Votre visite à {name} est dans environ une heure." },
    { critical: true, digestable: false },
  ),
  parent(
    "parent_waitlist_position",
    "live",
    "unified",
    "Uses daycare waitlist rank or status. Does not invent a place.",
    { label: "Waitlist place", detail: "Your place on a waitlist changes.", title: "Waitlist update", body: "Your place at {name} changed: {status}." },
    { label: "Place sur la liste", detail: "Votre place sur une liste d'attente change.", title: "Liste d'attente", body: "Votre place à {name} a changé : {status}." },
    { legacyCategory: "waitlist" },
  ),
  parent(
    "parent_new_message",
    "partial",
    "legacy",
    "In-app. The inbox already lists the thread. Email stays on the existing message mail.",
    { label: "New message", detail: "A centre sends you a message.", title: "New message", body: "You have a new message about {name}." },
    { label: "Nouveau message", detail: "Un centre vous envoie un message.", title: "Nouveau message", body: "Vous avez un nouveau message au sujet de {name}." },
    { legacyCategory: "message", critical: true, digestable: false },
  ),
  parent(
    "parent_centre_closure",
    "hook",
    "none",
    "No closure column, so nothing is scanned. Another feature can emit this hook when a centre marks a closure.",
    { label: "Unexpected closure", detail: "A centre marks an unexpected closure.", title: "Centre closed today", body: "{name} is closed today. Check before you go." },
    { label: "Fermeture imprévue", detail: "Un centre marque une fermeture imprévue.", title: "Centre fermé aujourd'hui", body: "{name} est fermé aujourd'hui. Vérifiez avant de partir." },
    { critical: true, digestable: false },
  ),
  parent(
    "parent_immunization_expiring",
    "partial",
    "unified",
    "family_documents.expires_on was added. An alert fires only when that date is set.",
    { label: "Immunization expiring", detail: "An immunization file you saved is close to its date.", title: "Immunization record expiring", body: "An immunization record is close to its date." },
    { label: "Vaccin à renouveler", detail: "Un dossier de vaccination que vous avez enregistré approche de sa date.", title: "Vaccination à renouveler", body: "Un dossier de vaccination approche de sa date." },
  ),
  parent(
    "parent_allergy_plan_expiring",
    "partial",
    "unified",
    "children.allergy_plan_expires_on was added. An alert fires only when that date is set.",
    { label: "Allergy plan expiring", detail: "An allergy plan date you saved is close.", title: "Allergy plan expiring", body: "An allergy plan is close to its date." },
    { label: "Plan d'allergie à renouveler", detail: "Une date de plan d'allergie que vous avez enregistrée approche.", title: "Plan d'allergie à renouveler", body: "Un plan d'allergie approche de sa date." },
  ),
  parent(
    "parent_coparent_changed",
    "hook",
    "none",
    "Co-parent linking is another branch. Call emitUnifiedAlert with this type. This branch does not create links.",
    { label: "Co-parent change", detail: "Someone is added or removed on your family.", title: "Family access changed", body: "A co-parent change was saved on your family." },
    { label: "Changement de co-parent", detail: "Quelqu'un est ajouté ou retiré de votre famille.", title: "Accès famille modifié", body: "Un changement de co-parent a été enregistré." },
  ),
  parent(
    "parent_dropoff_reminder",
    "hook",
    "none",
    "Drop-off reminders are another branch. Hook only.",
    { label: "Drop-off reminder", detail: "A reminder before drop-off.", title: "Drop-off reminder", body: "A drop-off reminder is ready for {name}." },
    { label: "Rappel d'arrivée", detail: "Un rappel avant l'arrivée.", title: "Rappel d'arrivée", body: "Un rappel d'arrivée est prêt pour {name}." },
  ),
  parent(
    "parent_pickup_reminder",
    "hook",
    "none",
    "Pick-up reminders are another branch. Hook only.",
    { label: "Pick-up reminder", detail: "A reminder before pick-up.", title: "Pick-up reminder", body: "A pick-up reminder is ready for {name}." },
    { label: "Rappel de départ", detail: "Un rappel avant le départ.", title: "Rappel de départ", body: "Un rappel de départ est prêt pour {name}." },
  ),
  parent(
    "parent_portfolio_item",
    "hook",
    "none",
    "Child portfolio is another branch. Hook only. Not built here.",
    { label: "Portfolio item", detail: "A new item on your child's portfolio.", title: "New portfolio item", body: "A new item was added for your child at {name}." },
    { label: "Portfolio", detail: "Un nouvel élément au portfolio de votre enfant.", title: "Nouvel élément au portfolio", body: "Un nouvel élément a été ajouté pour votre enfant à {name}." },
  ),
  daycare(
    "daycare_new_request",
    "partial",
    "legacy",
    "In-app for a new inquiry, tour, or enrolment. Existing request mail stays.",
    { label: "New parent request", detail: "A parent asks for info, a visit, or a spot.", title: "New parent request", body: "A parent sent a request for {name}." },
    { label: "Nouvelle demande", detail: "Un parent demande des infos, une visite ou une place.", title: "Nouvelle demande d'un parent", body: "Un parent a envoyé une demande pour {name}." },
    { legacyCategory: "enquiry", critical: true, digestable: false },
  ),
  daycare(
    "daycare_request_unanswered",
    "live",
    "unified",
    "A request still in requested or pending after 24 hours.",
    { label: "Request waiting a day", detail: "A parent request has had no reply for a day.", title: "Request still waiting", body: "A parent request at {name} has had no reply for a day." },
    { label: "Demande en attente", detail: "Une demande de parent n'a pas de réponse depuis un jour.", title: "Demande encore en attente", body: "Une demande à {name} n'a pas de réponse depuis un jour." },
  ),
  daycare(
    "daycare_licence_expiring",
    "partial",
    "legacy",
    "Licence date, screening expiry, or first aid date. Existing document mail stays.",
    { label: "Licence or screening", detail: "A licence, screening file, or first aid date is close or needs a look.", title: "Licence or screening", body: "A licence or screening item for {name} needs a look." },
    { label: "Permis ou filtrage", detail: "Un permis, un filtrage ou un secourisme approche ou demande un coup d'oeil.", title: "Permis ou filtrage", body: "Un permis ou un filtrage pour {name} demande un coup d'oeil." },
    { legacyCategory: "document_expiry", critical: true, digestable: false },
  ),
  daycare(
    "daycare_weekly_spots",
    "partial",
    "legacy",
    "Weekly nudge when this week's open-spot check-in was not saved. Email stays on the existing check-in mail.",
    { label: "Confirm open spots", detail: "A weekly note to confirm which spots are still open.", title: "Are spots still open?", body: "Tap to update open spots at {name}." },
    { label: "Confirmer les places", detail: "Une note hebdomadaire pour confirmer les places encore ouvertes.", title: "Les places sont-elles ouvertes?", body: "Touchez pour mettre à jour les places à {name}." },
    { legacyCategory: "open_spots" },
  ),
  daycare(
    "daycare_new_review",
    "live",
    "unified",
    "A new row in reviews. The text of the review is not copied into the alert.",
    { label: "New review", detail: "A parent publishes a review on your centre.", title: "New review", body: "A parent posted a review for {name}." },
    { label: "Nouvel avis", detail: "Un parent publie un avis sur votre centre.", title: "Nouvel avis", body: "Un parent a publié un avis pour {name}." },
  ),
  daycare(
    "daycare_new_message",
    "partial",
    "legacy",
    "In-app. Existing message mail stays.",
    { label: "New parent message", detail: "A parent sends a message.", title: "New message", body: "You have a new message about {name}." },
    { label: "Nouveau message d'un parent", detail: "Un parent envoie un message.", title: "Nouveau message", body: "Vous avez un nouveau message au sujet de {name}." },
    { legacyCategory: "message", critical: true, digestable: false },
  ),
  daycare(
    "daycare_family_left",
    "live",
    "unified",
    "Waitlist withdrawn, or a tour the parent declined (responded_by is the parent).",
    { label: "Family left", detail: "A family leaves the waitlist or cancels a visit.", title: "A family stepped back", body: "A family left a waitlist or a visit at {name}." },
    { label: "Famille retirée", detail: "Une famille quitte la liste d'attente ou annule une visite.", title: "Une famille s'est retirée", body: "Une famille a quitté une liste ou une visite à {name}." },
  ),
  staff(
    "staff_shift_start",
    "partial",
    "unified",
    "staff_shifts.staff_user_id was added. A reminder fires only when that login is set.",
    false,
    { label: "Shift starting", detail: "Your shift is about to start.", title: "Shift starting", body: "Your shift at {name} starts soon." },
    { label: "Début de quart", detail: "Votre quart va commencer.", title: "Début de quart", body: "Votre quart à {name} commence bientôt." },
  ),
  staff(
    "staff_shift_end",
    "partial",
    "unified",
    "Same link as shift start. End reminder only when the shift has a login.",
    false,
    { label: "Shift ending", detail: "Your shift is about to end.", title: "Shift ending", body: "Your shift at {name} ends soon." },
    { label: "Fin de quart", detail: "Votre quart va finir.", title: "Fin de quart", body: "Votre quart à {name} finit bientôt." },
  ),
  staff(
    "staff_ratio",
    "live",
    "unified",
    "ratio_checks against ratio_rules. Near is 85 percent of the limit. Over the limit is treated as critical at send time.",
    false,
    { label: "Room ratio", detail: "A room is near or over its staff-to-child limit.", title: "Room ratio", body: "A room at {name} is {status} its limit." },
    { label: "Ratio de salle", detail: "Une salle est proche ou au-dessus de sa limite.", title: "Ratio de salle", body: "Une salle à {name} est {status} sa limite." },
  ),
  staff(
    "staff_child_not_arrived",
    "partial",
    "unified",
    "Uses today's scheduled drop-off on the attendance sheet, not a learned usual time. No usual-time column exists.",
    false,
    { label: "Child not checked in", detail: "A child is not checked in after the drop-off time on today's sheet.", title: "Not checked in yet", body: "A child is not checked in past the drop-off time at {name}." },
    { label: "Enfant pas arrivé", detail: "Un enfant n'est pas enregistré après l'heure d'arrivée d'aujourd'hui.", title: "Pas encore arrivé", body: "Un enfant n'est pas enregistré après l'heure d'arrivée à {name}." },
  ),
  staff(
    "staff_child_still_here",
    "partial",
    "unified",
    "Uses today's scheduled pick-up. There is no separate usual pick-up column.",
    true,
    { label: "Still at the centre", detail: "A child is still checked in after the pick-up time on today's sheet.", title: "Still at the centre", body: "A child is still checked in after pick-up time at {name}." },
    { label: "Encore au centre", detail: "Un enfant est encore enregistré après l'heure de départ d'aujourd'hui.", title: "Encore au centre", body: "Un enfant est encore au centre après l'heure de départ à {name}." },
  ),
  staff(
    "staff_pickup_new",
    "live",
    "unified",
    "Fires when the parent already listed pickup people and the name is not on that list.",
    true,
    { label: "New pickup person", detail: "Someone not on the pickup list is picking up.", title: "New pickup person", body: "A pickup name at {name} is not on the family's list." },
    { label: "Nouvelle personne au départ", detail: "Quelqu'un qui n'est pas sur la liste vient chercher l'enfant.", title: "Nouvelle personne au départ", body: "Un nom de départ à {name} n'est pas sur la liste de la famille." },
  ),
  staff(
    "staff_pickup_restricted",
    "hook",
    "none",
    "Custody restrictions are another branch. Hook only.",
    true,
    { label: "Restricted pickup", detail: "A pickup person is restricted for this child.", title: "Restricted pickup", body: "A restricted pickup was recorded at {name}." },
    { label: "Départ restreint", detail: "Une personne au départ est restreinte pour cet enfant.", title: "Départ restreint", body: "Un départ restreint a été noté à {name}." },
  ),
  staff(
    "staff_medication_time",
    "live",
    "unified",
    "care_medications.schedule_times. A log today counts as done, because the log has no clock. The medicine name stays off the alert.",
    false,
    { label: "Medicine time", detail: "A saved medicine time is due.", title: "Medicine time", body: "A medicine time is due at {name}." },
    { label: "Heure du médicament", detail: "Une heure de médicament enregistrée est due.", title: "Heure du médicament", body: "Une heure de médicament est due à {name}." },
  ),
  staff(
    "staff_allergy_clock",
    "stub",
    "none",
    "Allergy text exists. There is no allergy clock. Not sent.",
    false,
    { label: "Allergy reminder", detail: "A timed allergy reminder.", title: "Allergy reminder", body: "An allergy reminder is due at {name}." },
    { label: "Rappel d'allergie", detail: "Un rappel d'allergie à l'heure.", title: "Rappel d'allergie", body: "Un rappel d'allergie est dû à {name}." },
  ),
  staff(
    "staff_room_checks",
    "stub",
    "none",
    "No nap, meal, or diaper due-check table for infant and toddler rooms. Not sent.",
    false,
    { label: "Room checks", detail: "Nap, meal, or diaper checks for infant and toddler rooms.", title: "Room check due", body: "A room check is due at {name}." },
    { label: "Contrôles de salle", detail: "Sieste, repas ou couche pour les poupons et les trottineurs.", title: "Contrôle de salle dû", body: "Un contrôle de salle est dû à {name}." },
  ),
  staff(
    "staff_cert_expiring",
    "partial",
    "legacy",
    "ECE certificates, staff credentials, and first aid dates. Existing certificate mail stays.",
    false,
    { label: "Certificate expiring", detail: "First aid, CPR, ECE, or a criminal record check is close to its date.", title: "Certificate expiring", body: "A staff certificate for {name} is close to its date." },
    { label: "Certificat à renouveler", detail: "Secourisme, RCR, EPE ou vérification du casier approche de sa date.", title: "Certificat à renouveler", body: "Un certificat du personnel pour {name} approche de sa date." },
    { legacyCategory: "document_expiry" },
  ),
  staff(
    "staff_safety_check",
    "partial",
    "unified",
    "Only centres that already log a maintenance or cleaning check. No due date is invented for centres that never logged one.",
    false,
    { label: "Safety check due", detail: "A fire drill or safety check has not been logged in 30 days.", title: "Safety check due", body: "{name} has not logged a safety check in 30 days." },
    { label: "Contrôle de sécurité dû", detail: "Un exercice d'incendie ou un contrôle n'a pas été noté depuis 30 jours.", title: "Contrôle de sécurité dû", body: "{name} n'a pas noté de contrôle de sécurité depuis 30 jours." },
  ),
  staff(
    "staff_incident_open",
    "live",
    "unified",
    "Serious incident not filed, or a care incident with no parent notice time.",
    true,
    { label: "Incident needs a finish", detail: "An incident report is not filed, or the parent has not been marked as told.", title: "Incident needs a finish", body: "An incident at {name} still needs a step." },
    { label: "Incident à terminer", detail: "Un rapport d'incident n'est pas déposé, ou le parent n'est pas marqué comme avisé.", title: "Incident à terminer", body: "Un incident à {name} a encore une étape." },
  ),
  staff(
    "staff_incident_signature",
    "stub",
    "none",
    "No parent-signature column on incidents. Not sent.",
    false,
    { label: "Parent signature", detail: "An incident needs a parent signature.", title: "Signature needed", body: "An incident at {name} needs a parent signature." },
    { label: "Signature du parent", detail: "Un incident a besoin de la signature du parent.", title: "Signature demandée", body: "Un incident à {name} a besoin de la signature du parent." },
  ),
  staff(
    "staff_custody_notice",
    "hook",
    "none",
    "Custody restrictions are another branch. Hook for a child in the staff room. Not built here.",
    true,
    { label: "Custody note", detail: "A custody restriction for a child in your room.", title: "Custody restriction", body: "A custody restriction applies to a child at {name}." },
    { label: "Note de garde", detail: "Une restriction de garde pour un enfant dans votre salle.", title: "Restriction de garde", body: "Une restriction de garde s'applique à un enfant à {name}." },
  ),
  staff(
    "staff_director_note",
    "live",
    "unified",
    "conversations.staff_note. The note text is not copied into the alert.",
    false,
    { label: "Director note", detail: "A director left a note on a family thread.", title: "Director note", body: "A director left a note on a family thread at {name}." },
    { label: "Note de la direction", detail: "La direction a laissé une note sur un fil de famille.", title: "Note de la direction", body: "La direction a laissé une note sur un fil à {name}." },
  ),
  staff(
    "staff_schedule_change",
    "partial",
    "unified",
    "A shift row created today. There is no before/after diff.",
    false,
    { label: "Schedule change", detail: "A shift was added on your login.", title: "Schedule change", body: "A shift was added at {name}." },
    { label: "Horaire modifié", detail: "Un quart a été ajouté sur votre compte.", title: "Horaire modifié", body: "Un quart a été ajouté à {name}." },
  ),
  staff(
    "staff_shift_swap",
    "stub",
    "none",
    "No shift-swap table. Not sent.",
    false,
    { label: "Shift swap", detail: "A coworker asks to swap a shift.", title: "Shift swap", body: "A shift swap was requested at {name}." },
    { label: "Échange de quart", detail: "Un collègue demande d'échanger un quart.", title: "Échange de quart", body: "Un échange de quart a été demandé à {name}." },
  ),
  staff(
    "staff_new_child",
    "partial",
    "unified",
    "Bookings store a start month, not a start day. The alert says this month, in the first 7 days of that month.",
    false,
    { label: "New child this month", detail: "A child is starting at your centre this month.", title: "New child this month", body: "A child is starting at {name} this month." },
    { label: "Nouvel enfant ce mois-ci", detail: "Un enfant commence à votre centre ce mois-ci.", title: "Nouvel enfant ce mois-ci", body: "Un enfant commence à {name} ce mois-ci." },
  ),
  {
    id: "admin_daily_digest",
    audience: "admin",
    readiness: "live",
    emailOwner: "unified",
    critical: false,
    digestable: true,
    webOnly: true,
    respectBlocks: false,
    note: "One daily note for the KidEase operator: new sign-ups from platform events. Web only. No government endorsement.",
    en: { label: "Daily sign-up digest", detail: "New parent and centre sign-ups from the last day.", title: "Daily KidEase digest", body: "{status} new sign-ups since yesterday." },
    fr: { label: "Résumé quotidien", detail: "Nouvelles inscriptions de parents et de centres depuis hier.", title: "Résumé quotidien KidEase", body: "{status} nouvelles inscriptions depuis hier." },
  },
  {
    id: "admin_safety_report",
    audience: "admin",
    readiness: "live",
    emailOwner: "unified",
    critical: true,
    digestable: false,
    webOnly: true,
    respectBlocks: false,
    note: "Open safety_reports. Government users only see a report when the centre province matches their org. Web only.",
    en: { label: "Safety report", detail: "A safety report is waiting for review.", title: "Safety report to review", body: "A safety report is waiting for review." },
    fr: { label: "Rapport de sécurité", detail: "Un rapport de sécurité attend une revue.", title: "Rapport de sécurité à revoir", body: "Un rapport de sécurité attend une revue." },
  },
  {
    id: "admin_safety_block",
    audience: "admin",
    readiness: "partial",
    emailOwner: "unified",
    critical: false,
    digestable: true,
    webOnly: true,
    respectBlocks: false,
    note: "safety_blocks have no review status. This is a log that a block was added, not a review task.",
    en: { label: "New block", detail: "Someone blocked a person or a centre.", title: "A block was added", body: "Someone blocked a person or a centre." },
    fr: { label: "Nouveau blocage", detail: "Quelqu'un a bloqué une personne ou un centre.", title: "Un blocage a été ajouté", body: "Quelqu'un a bloqué une personne ou un centre." },
  },
];

const TYPE_BY_ID = new Map(UNIFIED_ALERT_TYPES.map((row) => [row.id, row]));

export const PLUGIN_HOOKS = [
  "coparent_changed",
  "custody_restriction",
  "dropoff_reminder",
  "pickup_reminder",
  "portfolio_item",
  "centre_closure",
] as const;
export type PluginHook = (typeof PLUGIN_HOOKS)[number];

const HOOK_TYPE: Record<PluginHook, string> = {
  coparent_changed: "parent_coparent_changed",
  custody_restriction: "staff_custody_notice",
  dropoff_reminder: "parent_dropoff_reminder",
  pickup_reminder: "parent_pickup_reminder",
  portfolio_item: "parent_portfolio_item",
  centre_closure: "parent_centre_closure",
};

export function unifiedAlertType(id: string | null | undefined): UnifiedAlertType | null {
  if (!id) return null;
  return TYPE_BY_ID.get(id) ?? null;
}

export function isUnifiedAlertType(id: string | null | undefined): id is string {
  return TYPE_BY_ID.has(String(id || ""));
}

export function alertsForAudience(audience: UnifiedAudience, includeHidden = false): UnifiedAlertType[] {
  return UNIFIED_ALERT_TYPES.filter((row) => {
    if (row.audience !== audience) return false;
    if (includeHidden) return true;
    return row.readiness === "live" || row.readiness === "partial";
  });
}

export function alertChart(): Array<{ id: string; audience: UnifiedAudience; result: "pass" | "partial" | "fail"; note: string }> {
  return UNIFIED_ALERT_TYPES.map((row) => ({
    id: row.id,
    audience: row.audience,
    result: row.readiness === "live" ? "pass" : row.readiness === "partial" ? "partial" : "fail",
    note: row.note,
  }));
}

export const CANADA_TIME_ZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Moncton",
  "America/Toronto",
  "America/Iqaluit",
  "America/Winnipeg",
  "America/Regina",
  "America/Edmonton",
  "America/Yellowknife",
  "America/Vancouver",
  "America/Whitehorse",
] as const;

export type UnifiedSettings = {
  master: boolean;
  inApp: boolean;
  email: boolean;
  push: boolean;
  quietStart: string;
  quietEnd: string;
  quietCustom: boolean;
  timeZone: string;
  digest: DigestMode;
};

export const DEFAULT_PARENT_QUIET = { start: "21:00", end: "08:00" };
export const DEFAULT_STAFF_QUIET = { start: "18:00", end: "07:00" };

export function defaultUnifiedSettings(audience: UnifiedAudience, timeZone?: string | null): UnifiedSettings {
  const staff = audience === "staff";
  const quiet = staff ? DEFAULT_STAFF_QUIET : DEFAULT_PARENT_QUIET;
  const zone = isValidTimeZone(timeZone) ? timeZone : "America/Winnipeg";
  return {
    master: true,
    inApp: true,
    email: true,
    push: false,
    quietStart: quiet.start,
    quietEnd: quiet.end,
    quietCustom: false,
    timeZone: zone,
    digest: "off",
  };
}

export function normalizeAlertLocale(raw: unknown): AlertLocale {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "fr" || value.startsWith("fr") ? "fr" : "en";
}

export function parseClock(value: string | null | undefined): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function minuteOfDay(now: Date, timeZone: string): number | null {
  if (!isValidTimeZone(timeZone)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  const hour = num("hour") === 24 ? 0 : num("hour");
  const minute = num("minute");
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** True when minute sits in [start, end). Overnight when start > end. */
export function inClockWindow(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function isQuietAt(input: {
  now: Date;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
  staffShiftQuiet?: boolean;
  shift?: { start: string; end: string } | null;
}): boolean {
  const minute = minuteOfDay(input.now, input.timeZone);
  if (minute == null) return false;
  if (input.staffShiftQuiet) {
    const shiftStart = parseClock(input.shift?.start);
    const shiftEnd = parseClock(input.shift?.end);
    if (shiftStart != null && shiftEnd != null) return !inClockWindow(minute, shiftStart, shiftEnd);
    const fallbackStart = parseClock(DEFAULT_STAFF_QUIET.start) ?? 18 * 60;
    const fallbackEnd = parseClock(DEFAULT_STAFF_QUIET.end) ?? 7 * 60;
    return inClockWindow(minute, fallbackStart, fallbackEnd);
  }
  const start = parseClock(input.quietStart) ?? 21 * 60;
  const end = parseClock(input.quietEnd) ?? 8 * 60;
  return inClockWindow(minute, start, end);
}

export type SafetyBlockRow = {
  blockerUserId: string;
  blockedUserId?: string | null;
  daycareId?: string | null;
};

export function safetyBlocksAlert(input: {
  blocks: SafetyBlockRow[];
  recipientUserId: string;
  counterpartyUserId?: string | null;
  daycareId?: string | null;
}): boolean {
  const recipient = input.recipientUserId;
  const other = (input.counterpartyUserId || "").trim();
  const daycare = (input.daycareId || "").trim();
  return input.blocks.some((row) => {
    const blocker = row.blockerUserId;
    const blocked = (row.blockedUserId || "").trim();
    const centre = (row.daycareId || "").trim();
    if (blocked && ((blocker === recipient && blocked === other) || (blocker === other && blocked === recipient))) return true;
    if (!blocked && centre && daycare && centre === daycare && (blocker === recipient || (other && blocker === other))) return true;
    return false;
  });
}

const STREET = /\b\d{1,6}\s+\S+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|cres|crescent|way|lane|ln|court|ct)\b/i;

export function publicCentreName(raw: string | null | undefined, locale: AlertLocale): string {
  const name = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!name || STREET.test(name)) return locale === "fr" ? "Votre centre" : "Your centre";
  return name;
}

export function unifiedDeliveryBlocked(env: Record<string, string | undefined> | NodeJS.ProcessEnv): "test" | "preview" | null {
  const vercel = String(env.VERCEL_ENV || "")
    .trim()
    .toLowerCase();
  if (vercel === "preview") return "preview";
  const node = String(env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (node === "test") return "test";
  if (String(env.VITEST || "") === "true" || String(env.VITEST || "") === "1") return "test";
  if (String(env.npm_lifecycle_event || "") === "test") return "test";
  return null;
}

export type AlertDecision = {
  action: "skip" | "record";
  status: "inbox" | "held" | "digest";
  channels: UnifiedChannel[];
  outbound: "now" | "later" | "none";
  reason?: string;
};

export function decideUnifiedAlert(input: {
  typeId: string;
  settings: UnifiedSettings;
  typeEnabled: boolean;
  now?: Date;
  shift?: { start: string; end: string } | null;
  flagOn: boolean;
  live: boolean;
  pushArmed: boolean;
  previewOrTest: boolean;
  blocked: boolean;
  nativeShell?: boolean;
  duplicate?: boolean;
  lastSentAt?: Date | null;
  throttleMs?: number;
  /** Room-ratio "over" is critical even though the near case is not. */
  forceCritical?: boolean;
}): AlertDecision {
  const type = unifiedAlertType(input.typeId);
  const none = (reason: string): AlertDecision => ({
    action: "skip",
    status: "inbox",
    channels: [],
    outbound: "none",
    reason,
  });
  if (!type) return none("unknown");
  if (!input.flagOn) return none("flag");
  if (input.previewOrTest) return none("preview");
  if (type.readiness === "stub") return none("stub");
  if (input.duplicate) return none("duplicate");
  if (input.blocked && type.respectBlocks) return none("blocked");
  if (input.nativeShell && type.webOnly) return none("web_only");
  if (!input.settings.master) return none("master");
  if (!input.typeEnabled) return none("type_off");
  const now = input.now ?? new Date();
  const throttle = input.throttleMs ?? 0;
  if (throttle > 0 && input.lastSentAt && now.getTime() - input.lastSentAt.getTime() < throttle) return none("throttle");

  const channels: UnifiedChannel[] = [];
  if (input.settings.inApp) channels.push("in_app");
  const emailOk = type.emailOwner === "unified" && input.settings.email && input.live;
  if (emailOk) channels.push("email");
  const pushOk = input.settings.push && input.pushArmed && input.live && !type.webOnly;
  if (pushOk) channels.push("push");
  if (channels.length === 0) return none("no_channel");

  const critical = input.forceCritical ?? type.critical;
  const quiet = isQuietAt({
    now,
    timeZone: input.settings.timeZone,
    quietStart: input.settings.quietStart,
    quietEnd: input.settings.quietEnd,
    staffShiftQuiet: type.audience === "staff" && !input.settings.quietCustom,
    shift: input.shift,
  });
  const outboundChannels = channels.filter((channel) => channel !== "in_app");
  if (!outboundChannels.length) {
    return { action: "record", status: "inbox", channels, outbound: "none" };
  }
  if (critical || !quiet) {
    if (!critical && type.digestable && input.settings.digest !== "off" && outboundChannels.length > 0) {
      return { action: "record", status: "digest", channels, outbound: "later" };
    }
    return { action: "record", status: "inbox", channels, outbound: outboundChannels.length ? "now" : "none" };
  }
  return {
    action: "record",
    status: "held",
    channels,
    outbound: outboundChannels.length ? "later" : "none",
  };
}

function clean(raw: string | null | undefined, max: number): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function alertText(
  typeId: string,
  locale: AlertLocale,
  vars: { name?: string | null; status?: string | null } = {},
): { title: string; body: string } {
  const type = unifiedAlertType(typeId);
  const pack = type ? type[locale] : null;
  const name = publicCentreName(vars.name, locale);
  const status = clean(vars.status, 40);
  const fill = (template: string) => template.replaceAll("{name}", name).replaceAll("{status}", status);
  const title = fill(pack?.title || (locale === "fr" ? "Avis KidEase" : "KidEase alert"));
  const body = fill(pack?.body || "");
  return {
    title: title.replace(/\s+/g, " ").trim().slice(0, 80),
    body: body.replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

const HREF_PREFIXES = ["/parent", "/provider", "/inbox", "/admin", "/notifications", "/gov", "/daycare"];

export function safeUnifiedHref(href: string | null | undefined): string {
  const raw = String(href || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://") || raw.includes("\\")) return "/notifications";
  const path = raw.split("?")[0] || "";
  if (HREF_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return raw.slice(0, 180);
  return "/notifications";
}

export type UnifiedCandidate = {
  typeId: string;
  userId: string;
  dedupeKey: string;
  name: string;
  status: string;
  href: string;
  daycareId?: string | null;
  counterpartyUserId?: string | null;
  shift?: { start: string; end: string } | null;
};

export function planPluginHook(input: {
  hook: string;
  userId?: string | null;
  entityId?: string | null;
  name?: string | null;
  status?: string | null;
  href?: string | null;
  daycareId?: string | null;
  counterpartyUserId?: string | null;
}): UnifiedCandidate | null {
  if (!PLUGIN_HOOKS.includes(input.hook as PluginHook)) return null;
  const userId = String(input.userId || "").trim();
  const entityId = String(input.entityId || "").trim();
  if (!userId || !entityId) return null;
  const typeId = HOOK_TYPE[input.hook as PluginHook];
  return {
    typeId,
    userId,
    dedupeKey: `${typeId}:${entityId}`.slice(0, 180),
    name: String(input.name || ""),
    status: String(input.status || ""),
    href: safeUnifiedHref(input.href || (unifiedAlertType(typeId)?.audience === "staff" ? "/provider" : "/parent")),
    daycareId: input.daycareId,
    counterpartyUserId: input.counterpartyUserId,
  };
}

export function weekdayInZone(now: Date, timeZone: string): number | null {
  if (!isValidTimeZone(timeZone)) return null;
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const index = days.indexOf(name);
  return index >= 0 ? index : null;
}

/** Held mail sends when quiet hours end. Digest mail waits for morning, and Monday for weekly. */
export function digestReady(input: {
  digest: DigestMode;
  status: "held" | "digest" | "inbox";
  now: Date;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
  staffShiftQuiet?: boolean;
}): boolean {
  if (input.status === "inbox") return false;
  const quiet = isQuietAt({
    now: input.now,
    timeZone: input.timeZone,
    quietStart: input.quietStart,
    quietEnd: input.quietEnd,
    staffShiftQuiet: input.staffShiftQuiet,
  });
  if (quiet) return false;
  if (input.status === "held" || input.digest === "off") return true;
  const minute = minuteOfDay(input.now, input.timeZone);
  if (minute == null || minute < 8 * 60) return false;
  if (input.digest === "daily") return true;
  return weekdayInZone(input.now, input.timeZone) === 1;
}

export function unifiedUiCopy(locale: AlertLocale) {
  if (locale === "fr") {
    return {
      title: "Alertes KidEase",
      what: "KidEase vous prévient des places, des visites et des notes de votre centre.",
      why: "Vous choisissez chaque alerte. Rien ne part la nuit si vous avez des heures calmes.",
      next: "Enregistrez vos choix.",
      off: "Les alertes KidEase sont éteintes. Vous pouvez préparer vos choix. Rien n'est envoyé.",
      master: "Alertes activées",
      masterDetail: "Le bouton principal. Éteint, aucune alerte ne part.",
      channels: "Où les recevoir",
      inApp: "Dans l'appli",
      inAppDetail: "Un badge et une liste sur cette page.",
      email: "Courriel",
      emailDetail: "Un courriel pour les alertes qui n'ont pas déjà le leur.",
      push: "Notification sur le téléphone",
      pushDetail: "Seulement si les notifications KidEase sont déjà ouvertes. Les applis arrivent bientôt. Pas de texto.",
      pushOff: "Les notifications du téléphone ne sont pas ouvertes. Le courriel et la liste restent.",
      quiet: "Heures calmes",
      quietStart: "Calme à partir de",
      quietEnd: "Jusqu'à",
      zone: "Fuseau horaire",
      staffQuiet: "Pour le personnel, les heures calmes sont en dehors du quart. Sans quart, c'est de 18 h à 7 h.",
      digest: "Regrouper les courriels",
      digestOff: "Tout de suite",
      digestDaily: "Une fois par jour",
      digestWeekly: "Une fois par semaine",
      save: "Enregistrer les alertes",
      saved: "Choix enregistrés",
      error: "Nous n'avons pas pu enregistrer. Réessayez, ou écrivez à support@kidease.ca.",
      listTitle: "Vos alertes",
      empty: "Pas encore d'alerte.",
      emptyLead: "Quand quelque chose arrive, ce sera ici.",
      findCare: "Chercher une place",
      openCentre: "Ouvrir votre centre",
      hidden: "Certaines alertes attendent le partage familial, la garde, ou une liste de contrôles de salle. Elles ne sont pas envoyées.",
      critical: "Important",
      groups: { parent: "Parents", daycare: "Garderies", staff: "Personnel", admin: "Bureau" },
    };
  }
  return {
    title: "KidEase alerts",
    what: "KidEase tells you about open spots, visits, and notes from your centre.",
    why: "You turn each alert on or off. Quiet hours hold mail until morning.",
    next: "Save your choices.",
    off: "KidEase alerts are off. You can set your choices. Nothing is sent.",
    master: "Alerts on",
    masterDetail: "The main switch. Off means nothing is sent.",
    channels: "Where to get them",
    inApp: "In the app",
    inAppDetail: "A badge and a list on this page.",
    email: "Email",
    emailDetail: "Email for alerts that do not already have their own email.",
    push: "Phone alert",
    pushDetail: "Only if KidEase phone alerts are already on. The apps are coming soon. No texts.",
    pushOff: "Phone alerts are not on. Email and this list still work.",
    quiet: "Quiet hours",
    quietStart: "Quiet from",
    quietEnd: "Until",
    zone: "Time zone",
    staffQuiet: "For staff, quiet hours sit outside the shift. With no shift, that is 6 p.m. to 7 a.m.",
    digest: "Group emails",
    digestOff: "Right away",
    digestDaily: "Once a day",
    digestWeekly: "Once a week",
    save: "Save alerts",
    saved: "Choices saved",
    error: "We could not save. Try again, or email support@kidease.ca.",
    listTitle: "Your alerts",
    empty: "No alerts yet.",
    emptyLead: "When something happens, it shows up here.",
    findCare: "Find care",
    openCentre: "Open your centre",
    hidden: "Some alerts wait on family sharing, custody, or room checklists. They are not sent.",
    critical: "Important",
    groups: { parent: "Parents", daycare: "Daycares", staff: "Staff", admin: "Desk" },
  };
}
