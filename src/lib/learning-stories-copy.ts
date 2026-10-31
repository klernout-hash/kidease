import { FRAMEWORK_DOMAINS, LEARNING_FRAMEWORKS, type LearningFramework } from "./learning-stories.ts";

type Domain = { id: string; label: string };

export type StoriesCopy = {
  offTitle: string;
  offBody: string;
  home: string;
  title: string;
  lead: string;
  parentLead: string;
  child: string;
  framework: string;
  domain: string;
  observed: string;
  storyTitle: string;
  body: string;
  save: string;
  empty: string;
  noChildren: string;
  saved: string;
  bad: string;
  privateNote: string;
  frameworks: Record<LearningFramework, string>;
  domains: Record<LearningFramework, Domain[]>;
};

const domainLabels = {
  en: {
    belonging: "Belonging",
    "well-being": "Well-being",
    engagement: "Engagement",
    expression: "Expression",
    play: "Play and playfulness",
    communication: "Communication and literacies",
    diversity: "Diversity and social responsibility",
    identities: "Identities and social responsibility",
    exploration: "Exploration",
  },
  fr: {
    belonging: "Appartenance",
    "well-being": "Bien-être",
    engagement: "Engagement",
    expression: "Expression",
    play: "Jeu",
    communication: "Communication",
    diversity: "Diversité et responsabilité",
    identities: "Identités et responsabilité",
    exploration: "Exploration",
  },
} as const;

function domains(locale: "en" | "fr"): Record<LearningFramework, Domain[]> {
  const labels = domainLabels[locale];
  return Object.fromEntries(
    LEARNING_FRAMEWORKS.map((framework) => [
      framework,
      FRAMEWORK_DOMAINS[framework].map((id) => ({ id, label: labels[id as keyof typeof labels] })),
    ]),
  ) as Record<LearningFramework, Domain[]>;
}

const en: Omit<StoriesCopy, "domains"> = {
  offTitle: "Learning stories are off",
  offBody: "A story stays with the enrolled family. It is not on the public listing, and there are no photos.",
  home: "Back to today",
  title: "Learning stories",
  lead: "Write one story for one enrolled child. Pick the provincial framework. No photos.",
  parentLead: "Stories from your child's centre. Only you can see them here.",
  child: "Child",
  framework: "Framework",
  domain: "Area",
  observed: "Observed on",
  storyTitle: "Title",
  body: "What you noticed",
  save: "Save story",
  empty: "No stories yet.",
  noChildren: "No enrolled child is on file for this centre yet.",
  saved: "Saved. Only the enrolled family can read this.",
  bad: "Check the child, the date, and the story.",
  privateNote: "Private. Not on the public listing.",
  frameworks: {
    hdlh: "HDLH",
    flight: "Flight",
    elf: "ELF",
    accueillir: "Accueillir la petite enfance",
  },
};

const fr: Omit<StoriesCopy, "domains"> = {
  offTitle: "Les histoires d'apprentissage sont éteintes",
  offBody: "Une histoire reste avec la famille inscrite. Elle n'est pas sur la fiche publique, et il n'y a pas de photo.",
  home: "Retour à aujourd'hui",
  title: "Histoires d'apprentissage",
  lead: "Écrivez une histoire pour un enfant inscrit. Choisissez le cadre provincial. Pas de photo.",
  parentLead: "Les histoires du centre de votre enfant. Vous seul pouvez les lire ici.",
  child: "Enfant",
  framework: "Cadre",
  domain: "Domaine",
  observed: "Observé le",
  storyTitle: "Titre",
  body: "Ce que vous avez remarqué",
  save: "Enregistrer l'histoire",
  empty: "Aucune histoire pour le moment.",
  noChildren: "Aucun enfant inscrit n'est au dossier de ce centre.",
  saved: "Enregistré. Seule la famille inscrite peut lire ceci.",
  bad: "Vérifiez l'enfant, la date et l'histoire.",
  privateNote: "Privé. Pas sur la fiche publique.",
  frameworks: {
    hdlh: "HDLH",
    flight: "Flight",
    elf: "ELF",
    accueillir: "Accueillir la petite enfance",
  },
};

export function storiesCopy(locale: string | null | undefined): StoriesCopy {
  const frMode = locale === "fr";
  const base = frMode ? fr : en;
  return { ...base, domains: domains(frMode ? "fr" : "en") };
}
