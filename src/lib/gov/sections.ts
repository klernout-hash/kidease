import { govCopy } from "./copy.ts";

export function deskGroups(locale: "en" | "fr", copy: ReturnType<typeof govCopy>, onOverview = true) {
  const fr = locale === "fr";
  const root = fr ? "/fr/gov" : "/gov";
  const p = (leaf: string) => (fr ? `/fr/gov/${leaf}` : `/gov/${leaf}`);
  const pair = (href: string, label: string): [string, string] => [href, label];
  const jump = (hash: string) => (onOverview ? hash : `${root}${hash}`);
  return [
    { title: copy.overviewLink, links: [pair(onOverview ? "#gov-cards" : root, copy.overviewLink), pair(jump("#gov-needs-title"), copy.needsTitle)] },
    { title: fr ? "Permis et renouvellements" : "Licences and renewals", links: [pair(p("compliance"), fr ? "Dates de permis" : "Licence dates"), pair(p("screening"), fr ? "Vérifications du personnel" : "Staff screening")] },
    { title: fr ? "Conformité" : "Compliance", links: [pair(p("incidents"), fr ? "Événements graves" : "Serious occurrences"), pair(p("complaints"), fr ? "Plaintes" : "Complaints"), pair(p("fee-caps"), fr ? "Plafonds de tarifs" : "Fee caps"), pair(p("ratios"), fr ? "Ratios" : "Room ratios")] },
    { title: fr ? "Capacité et demande" : "Capacity and demand", links: [pair(p("demand"), fr ? "Demande enregistrée" : "Saved-search demand"), pair(p("funding"), fr ? "Rapports de financement" : "Funding reports"), pair(jump("#gov-cities-title"), copy.areasLink)] },
    { title: copy.workforceLink, links: [pair(jump("#gov-jobs"), copy.workforceLink)] },
    { title: fr ? "Rapports et sources" : "Reports and sources", links: [pair(jump("#gov-sources"), copy.sourcesTitle), pair(p("exports"), fr ? "Exportations" : "Exports"), pair(p("audit"), fr ? "Préparation à l’effacement" : "Deletion readiness"), pair(p("broadcasts"), fr ? "Avis d’urgence" : "Emergency notice")] },
  ];
}
