/**
 * Door check-in records arrived or picked up. It does not take a photo.
 */

export function doorStatus(action: "check_in" | "check_out"): "arrived" | "departed" {
  return action === "check_in" ? "arrived" : "departed";
}

export function todayYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const DOOR_COPY = {
  en: {
    title: "Check in",
    lead: "Mark when a child arrives or is picked up. This does not take a photo. A child's face is not shown here.",
    child: "Child's first name",
    in: "Check in",
    out: "Check out",
    saved: "Saved for today.",
    needName: "Add the child's first name.",
    help: "Help",
  },
  fr: {
    title: "Arrivée",
    lead: "Notez l'arrivée ou le départ. Ceci ne prend pas de photo. Le visage d'un enfant n'est pas montré ici.",
    child: "Prénom de l'enfant",
    in: "Arrivée",
    out: "Départ",
    saved: "Enregistré pour aujourd'hui.",
    needName: "Ajoutez le prénom de l'enfant.",
    help: "Aide",
  },
} as const;

export function doorCopy(locale: "en" | "fr") {
  return locale === "fr" ? DOOR_COPY.fr : DOOR_COPY.en;
}
