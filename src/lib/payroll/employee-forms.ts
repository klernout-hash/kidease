/**
 * Employee forms the person fills on their phone.
 * The centre owner reviews them. The official CRA or Revenu Québec form wins
 * if our plain-language questions ever differ.
 * Checked 22 November 2026.
 */

export const FORM_AS_OF = "2026-11-22";

export const FORM_KINDS = [
  "td1_federal",
  "td1_provincial",
  "tp1015",
  "deposit",
  "emergency",
  "new_hire",
  "roe_guide",
] as const;

export type FormKind = (typeof FORM_KINDS)[number];

export type EmployeeFormCard = {
  kind: FormKind;
  titleEn: string;
  titleFr: string;
  officialName: string;
  officialUrl: string;
  asOf: string;
  /** Quebec uses TP-1015.3-V instead of a CRA provincial TD1. */
  applies: boolean;
};

const CRA = "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms";

const PROVINCIAL_TD1: Record<string, { code: string; name: string }> = {
  AB: { code: "td1ab", name: "TD1AB" },
  BC: { code: "td1bc", name: "TD1BC" },
  MB: { code: "td1mb", name: "TD1MB" },
  NB: { code: "td1nb", name: "TD1NB" },
  NL: { code: "td1nl", name: "TD1NL" },
  NS: { code: "td1ns", name: "TD1NS" },
  NT: { code: "td1nt", name: "TD1NT" },
  NU: { code: "td1nu", name: "TD1NU" },
  ON: { code: "td1on", name: "TD1ON" },
  PE: { code: "td1pe", name: "TD1PE" },
  SK: { code: "td1sk", name: "TD1SK" },
  YT: { code: "td1yt", name: "TD1YT" },
};

export const ROE_WEB = "https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/ei-roe/access-roe.html";

export const OFFICIAL_WINS_EN = "If this page and the official form differ, the official form wins.";
export const OFFICIAL_WINS_FR = "Si cette page et le formulaire officiel diffèrent, le formulaire officiel l'emporte.";

export function formsForProvince(province: string): EmployeeFormCard[] {
  const code = province.toUpperCase();
  const quebec = code === "QC";
  const provincial = PROVINCIAL_TD1[code];
  const cards: EmployeeFormCard[] = [
    {
      kind: "td1_federal",
      titleEn: "Federal tax form",
      titleFr: "Formulaire d'impôt fédéral",
      officialName: "TD1",
      officialUrl: `${CRA}/td1.html`,
      asOf: FORM_AS_OF,
      applies: true,
    },
    {
      kind: "td1_provincial",
      titleEn: "Provincial tax form",
      titleFr: "Formulaire d'impôt provincial",
      officialName: provincial?.name ?? "TD1",
      officialUrl: provincial ? `${CRA}/${provincial.code}.html` : `${CRA}/td1.html`,
      asOf: FORM_AS_OF,
      applies: !quebec && Boolean(provincial),
    },
    {
      kind: "tp1015",
      titleEn: "Quebec tax form",
      titleFr: "Formulaire d'impôt du Québec",
      officialName: "TP-1015.3-V",
      officialUrl: "https://www.revenuquebec.ca/en/online-services/forms-and-publications/current-details/tp-1015.3-v/",
      asOf: FORM_AS_OF,
      applies: quebec,
    },
    {
      kind: "deposit",
      titleEn: "Pay deposit",
      titleFr: "Dépôt de la paie",
      officialName: "Direct deposit",
      officialUrl: "https://www.canada.ca/en/revenue-agency/services/about-canada-revenue-agency-cra/direct-deposit.html",
      asOf: FORM_AS_OF,
      applies: true,
    },
    {
      kind: "emergency",
      titleEn: "Emergency contact",
      titleFr: "Personne à joindre",
      officialName: "Centre record",
      officialUrl: "",
      asOf: FORM_AS_OF,
      applies: true,
    },
    {
      kind: "new_hire",
      titleEn: "New job sheet",
      titleFr: "Fiche de nouvelle embauche",
      officialName: "New hire",
      officialUrl: `${CRA}/td1.html`,
      asOf: FORM_AS_OF,
      applies: true,
    },
    {
      kind: "roe_guide",
      titleEn: "Record of employment",
      titleFr: "Relevé d'emploi",
      officialName: "ROE Web",
      officialUrl: ROE_WEB,
      asOf: FORM_AS_OF,
      applies: true,
    },
  ];
  return cards.filter((card) => card.applies);
}

export const ROE_STEPS_EN = [
  "Sign in to ROE Web with the centre's Service Canada account.",
  "Pick the person and the last day they were paid.",
  "Enter the reason and the pay periods KidEase prepared.",
  "Submit on ROE Web. KidEase does not file it.",
] as const;

export const ROE_STEPS_FR = [
  "Ouvrez ROE Web avec le compte Service Canada du centre.",
  "Choisissez la personne et le dernier jour payé.",
  "Inscrivez la raison et les périodes que KidEase a préparées.",
  "Envoyez le relevé dans ROE Web. KidEase ne le dépose pas.",
] as const;

export type FormAnswers = {
  claimDollars?: string;
  extraTaxDollars?: string;
  startDate?: string;
  job?: string;
  phone?: string;
  contactName?: string;
  contactPhone?: string;
  relation?: string;
};

/** What we keep after a save. Bank and SIN numbers are never in this object. */
export function publicFormRecord(input: {
  kind: FormKind;
  version: number;
  status: "pending" | "approved";
  savedOn: string;
  bankLast4: string | null;
}): { kind: FormKind; version: number; status: "pending" | "approved"; savedOn: string; bankLast4: string | null } {
  return {
    kind: input.kind,
    version: input.version,
    status: input.status,
    savedOn: input.savedOn,
    bankLast4: input.bankLast4 && /^\d{4}$/.test(input.bankLast4) ? input.bankLast4 : null,
  };
}

export function maskAccount(account: string): string | null {
  const digits = account.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function formPdfLines(input: {
  locale: "en" | "fr";
  centre: string;
  person: string;
  card: EmployeeFormCard;
  version: number;
  savedOn: string;
  bankLast4: string | null;
}): string[] {
  const fr = input.locale === "fr";
  const title = fr ? input.card.titleFr : input.card.titleEn;
  return [
    "KidEase",
    title,
    `${fr ? "Centre" : "Centre"}: ${input.centre}`,
    `${fr ? "Personne" : "Person"}: ${input.person}`,
    `${fr ? "Version" : "Version"} ${input.version} · ${input.savedOn}`,
    input.bankLast4 ? `${fr ? "Compte" : "Account"} ****${input.bankLast4}` : "",
    `${input.card.officialName} · ${input.card.asOf}`,
    input.card.officialUrl,
    fr ? OFFICIAL_WINS_FR : OFFICIAL_WINS_EN,
  ].filter(Boolean);
}
