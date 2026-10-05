/**
 * Provincial and territorial child care licensing contacts.
 * Phones and links are copied from the official pages named in `source`.
 * Do not add a number that is not on that page.
 */

export type LicensingPhone = {
  labelEn: string;
  labelFr: string;
  /** Digits for a tel: link, including country code. */
  tel: string;
  display: string;
};

export type LicensingOffice = {
  code: string;
  nameEn: string;
  nameFr: string;
  href: string;
  phones: LicensingPhone[];
  noteEn?: string;
  noteFr?: string;
  source: string;
};

export const LICENSING_OFFICES: LicensingOffice[] = [
  {
    code: "BC",
    nameEn: "British Columbia",
    nameFr: "Colombie-Britannique",
    href: "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/communications-engagement/reporting-on-child-care-facilities/making-a-complaint-about-a-licensed-child-day-care-facility",
    phones: [
      {
        labelEn: "Service BC, toll-free",
        labelFr: "Service BC, sans frais",
        tel: "+18006637867",
        display: "1-800-663-7867",
      },
    ],
    noteEn:
      "Health authorities license child care in British Columbia. Service BC connects you to the local licensing office. Local numbers are on the official page.",
    noteFr:
      "Les autorités sanitaires délivrent les permis en Colombie-Britannique. Service BC vous relie au bureau local. Les numéros locaux sont sur la page officielle.",
    source: "gov.bc.ca complaint page",
  },
  {
    code: "AB",
    nameEn: "Alberta",
    nameFr: "Alberta",
    href: "https://www.alberta.ca/childcare-report-an-incident-concern-or-complaint",
    phones: [
      {
        labelEn: "Childcare Connect",
        labelFr: "Childcare Connect",
        tel: "+18446445165",
        display: "1-844-644-5165",
      },
    ],
    source: "alberta.ca report a concern",
  },
  {
    code: "SK",
    nameEn: "Saskatchewan",
    nameFr: "Saskatchewan",
    href: "https://www.saskatchewan.ca/residents/family-and-social-support/child-care/child-care-in-saskatchewan",
    phones: [
      {
        labelEn: "Child Care Operations",
        labelFr: "Child Care Operations",
        tel: "+18558249419",
        display: "1-855-824-9419",
      },
    ],
    source: "saskatchewan.ca child care",
  },
  {
    code: "MB",
    nameEn: "Manitoba",
    nameFr: "Manitoba",
    href: "https://www.gov.mb.ca/education/childcare/",
    phones: [
      {
        labelEn: "Early Learning and Child Care",
        labelFr: "Apprentissage et garde des jeunes enfants",
        tel: "+12049450776",
        display: "204-945-0776",
      },
      {
        labelEn: "Toll-free in Manitoba",
        labelFr: "Sans frais au Manitoba",
        tel: "+18882134754",
        display: "1-888-213-4754",
      },
    ],
    source: "gov.mb.ca Early Learning and Child Care",
  },
  {
    code: "ON",
    nameEn: "Ontario",
    nameFr: "Ontario",
    href: "https://www.ontario.ca/page/make-a-child-care-complaint",
    phones: [
      {
        labelEn: "Ministry of Education, toll-free",
        labelFr: "Ministère de l’Éducation, sans frais",
        tel: "+18775105333",
        display: "1-877-510-5333",
      },
    ],
    source: "ontario.ca make a child care complaint",
  },
  {
    code: "QC",
    nameEn: "Quebec",
    nameFr: "Québec",
    href: "https://www.mfa.gouv.qc.ca/en/pour-nous-joindre/Pages/deposer-plainte.aspx",
    phones: [
      {
        labelEn: "Ministère de la Famille",
        labelFr: "Ministère de la Famille",
        tel: "+18553368568",
        display: "1-855-336-8568",
      },
    ],
    source: "mfa.gouv.qc.ca file a complaint",
  },
  {
    code: "NB",
    nameEn: "New Brunswick",
    nameFr: "Nouveau-Brunswick",
    href: "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/contacts.html",
    phones: [
      {
        labelEn: "General information",
        labelFr: "Renseignements généraux",
        tel: "+15064533678",
        display: "506-453-3678",
      },
    ],
    noteEn: "This is the general line. Regional licensing teams are listed on the official contacts page.",
    noteFr: "Ceci est la ligne générale. Les équipes régionales de permis sont sur la page officielle des coordonnées.",
    source: "gnb.ca early learning contacts",
  },
  {
    code: "NS",
    nameEn: "Nova Scotia",
    nameFr: "Nouvelle-Écosse",
    href: "https://childcarenovascotia.ca/contacts",
    phones: [
      {
        labelEn: "Complaints about a program",
        labelFr: "Plaintes au sujet d’un programme",
        tel: "+18772239555",
        display: "1-877-223-9555",
      },
      {
        labelEn: "Early Learning and Child Care Branch",
        labelFr: "Direction de l’apprentissage et de la garde",
        tel: "+19024243673",
        display: "902-424-3673",
      },
    ],
    source: "childcarenovascotia.ca contacts",
  },
  {
    code: "PE",
    nameEn: "Prince Edward Island",
    nameFr: "Île-du-Prince-Édouard",
    href: "https://www.princeedwardisland.ca/en/information/education-and-early-years/about-the-early-learning-and-child-care-board",
    phones: [
      {
        labelEn: "Early Learning and Child Care Board",
        labelFr: "Conseil de l’apprentissage et de la garde",
        tel: "+19023686518",
        display: "902-368-6518",
      },
    ],
    source: "princeedwardisland.ca ELCC Board",
  },
  {
    code: "NL",
    nameEn: "Newfoundland and Labrador",
    nameFr: "Terre-Neuve-et-Labrador",
    href: "https://www.gov.nl.ca/education/department/contact/",
    phones: [
      {
        labelEn: "Metro (St. John's)",
        labelFr: "Région métropolitaine (St. John’s)",
        tel: "+17097294331",
        display: "1-709-729-4331",
      },
      {
        labelEn: "Central East, west of Clarenville",
        labelFr: "Centre-est, à l’ouest de Clarenville",
        tel: "+17092926283",
        display: "1-709-292-6283",
      },
      {
        labelEn: "Central East, Clarenville and east",
        labelFr: "Centre-est, Clarenville et l’est",
        tel: "+17099456557",
        display: "1-709-945-6557",
      },
      {
        labelEn: "Western",
        labelFr: "Ouest",
        tel: "+17096372763",
        display: "1-709-637-2763",
      },
      {
        labelEn: "Labrador",
        labelFr: "Labrador",
        tel: "+17098963591",
        display: "1-709-896-3591",
      },
    ],
    noteEn:
      "Licensing is by region. These are the Early Learning and Child Development offices on the official contact page.",
    noteFr:
      "Les permis sont gérés par région. Ce sont les bureaux de développement de la petite enfance sur la page officielle.",
    source: "gov.nl.ca education contact",
  },
  {
    code: "YT",
    nameEn: "Yukon",
    nameFr: "Yukon",
    href: "https://yukon.ca/en/legal-and-social-supports/childrens-services/apply-child-care-subsidy",
    phones: [
      {
        labelEn: "Early Learning and Child Care Unit",
        labelFr: "Unité des services éducatifs à la petite enfance",
        tel: "+18676673492",
        display: "867-667-3492",
      },
    ],
    noteEn: "Toll-free in Yukon: 1-800-661-0408, then extension 3492. Listed on yukon.ca.",
    noteFr: "Sans frais au Yukon : 1-800-661-0408, puis le poste 3492. Indiqué sur yukon.ca.",
    source: "yukon.ca Early Learning and Child Care Unit",
  },
  {
    code: "NT",
    nameEn: "Northwest Territories",
    nameFr: "Territoires du Nord-Ouest",
    href: "https://www.ece.gov.nt.ca/en/early-childhood-consultants",
    phones: [
      {
        labelEn: "North Slave (Yellowknife)",
        labelFr: "Slave Nord (Yellowknife)",
        tel: "+18677679356",
        display: "867-767-9356",
      },
      {
        labelEn: "South Slave (Hay River)",
        labelFr: "Slave Sud (Hay River)",
        tel: "+18678745056",
        display: "867-874-5056",
      },
      {
        labelEn: "Beaufort Delta (Inuvik)",
        labelFr: "Beaufort-Delta (Inuvik)",
        tel: "+18677777365",
        display: "867-777-7365",
      },
      {
        labelEn: "Dehcho",
        labelFr: "Dehcho",
        tel: "+18676957329",
        display: "867-695-7329",
      },
      {
        labelEn: "Sahtu",
        labelFr: "Sahtu",
        tel: "+18675877159",
        display: "867-587-7159",
      },
    ],
    noteEn: "There is no single territorial phone line. Call the Early Childhood Consultant for your region.",
    noteFr: "Il n’y a pas une seule ligne pour tout le territoire. Appelez la personne-conseil en petite enfance de votre région.",
    source: "ece.gov.nt.ca early childhood consultants",
  },
  {
    code: "NU",
    nameEn: "Nunavut",
    nameFr: "Nunavut",
    href: "https://www.gov.nu.ca/en/education-and-schools/elcc-contacts",
    phones: [
      {
        labelEn: "Iqaluit / Qikiqtani, toll-free",
        labelFr: "Iqaluit / Qikiqtani, sans frais",
        tel: "+18339303938",
        display: "1-833-930-3938",
      },
      {
        labelEn: "Qikiqtani, toll-free",
        labelFr: "Qikiqtani, sans frais",
        tel: "+18339303935",
        display: "1-833-930-3935",
      },
      {
        labelEn: "Kitikmeot, toll-free",
        labelFr: "Kitikmeot, sans frais",
        tel: "+18339303937",
        display: "1-833-930-3937",
      },
      {
        labelEn: "Kivalliq, toll-free",
        labelFr: "Kivalliq, sans frais",
        tel: "+18339303936",
        display: "1-833-930-3936",
      },
    ],
    noteEn: "Early childhood officers are regional. These toll-free numbers are on the official contacts page.",
    noteFr: "Les agentes de la petite enfance sont régionales. Ces numéros sans frais sont sur la page officielle.",
    source: "gov.nu.ca ELCC contacts",
  },
];

const BY_CODE = new Map(LICENSING_OFFICES.map((office) => [office.code, office]));

export function licensingOffice(code: string | null | undefined): LicensingOffice | undefined {
  const key = String(code || "").trim().toUpperCase();
  return BY_CODE.get(key);
}

export function reportSearchProvince(raw: unknown): string {
  const key = String(raw || "").trim().toUpperCase();
  return BY_CODE.has(key) ? key : "";
}
