/**
 * French place phrases for provinces and territories.
 * Quebec daycare names stay as listed. This is only the place name in a sentence.
 */

const LOCATIVE_FR: Record<string, string> = {
  BC: "en Colombie-Britannique",
  AB: "en Alberta",
  SK: "en Saskatchewan",
  MB: "au Manitoba",
  ON: "en Ontario",
  QC: "au Québec",
  NB: "au Nouveau-Brunswick",
  NS: "en Nouvelle-Écosse",
  PE: "à l’Île-du-Prince-Édouard",
  NL: "à Terre-Neuve-et-Labrador",
  YT: "au Yukon",
  NT: "dans les Territoires du Nord-Ouest",
  NU: "au Nunavut",
};

/** Short labels on city pages. French uses the usual abbreviations, not BC or NS. */
const ABBREV_FR: Record<string, string> = {
  BC: "C.-B.",
  AB: "Alb.",
  SK: "Sask.",
  MB: "Man.",
  ON: "Ont.",
  QC: "Qc",
  NB: "N.-B.",
  NS: "N.-É.",
  PE: "Î.-P.-É.",
  NL: "T.-N.-L.",
  YT: "Yn",
  NT: "T.N.-O.",
  NU: "Nt",
};

export function provinceLocativeFr(code: string): string {
  const key = code.trim().toUpperCase();
  return LOCATIVE_FR[key] ?? `en ${code}`;
}

export function provinceAbbrev(code: string, locale: string): string {
  const key = code.trim().toUpperCase();
  if (locale === "fr") return ABBREV_FR[key] ?? key;
  return key;
}
