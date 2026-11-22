/** Planning aids only. The regulator is the source of truth, including for fees. */
export const LICENSING_REVIEW_DATE = "2026-11-22";
type Line = readonly [english: string, french: string];
type LicensingGuide = {
  source?: string;
  sourceFr?: string;
  pathway: Line;
  orientationLinks?: readonly { label: Line; url: Line }[];
  application: Line;
  costs?: Line;
  timing?: Line;
};

export const LICENSING_GUIDES: Readonly<Partial<Record<string, LicensingGuide>>> = {
  BC: {
    source:
      "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-resource-referral/info-for-child-care-providers",
    pathway: [
      "Contact your regional health authority’s licensing program. Your local Child Care Resource and Referral office can connect you.",
      "Communiquez avec le service de délivrance de permis de votre régie de santé. Le service local d’information et d’aiguillage peut vous aider.",
    ],
    application: [
      "Ask the health authority for its facility application and the supporting documents for your care category.",
      "Demandez à la régie de santé le formulaire d’établissement et la liste des pièces pour votre catégorie de garde.",
    ],
  },
  AB: {
    source: "https://www.alberta.ca/licensed-facility-based-programs",
    pathway: [
      "For a first facility-based licence, sign up with Childcare Connect for the required information session. Family day homes follow a different pathway.",
      "Pour un premier permis en établissement, inscrivez-vous à la séance obligatoire auprès de Childcare Connect. La garde en milieu familial suit une autre démarche.",
    ],
    application: [
      "Use the province’s licence form and program-plan template. Provide location documents and coordinate approvals and the first inspection.",
      "Utilisez le formulaire de permis et le modèle de programme de la province. Joignez les documents du lieu et coordonnez les approbations et l’inspection initiale.",
    ],
    costs: [
      "Facility-based programs: Alberta lists CA$200 for a new application and CA$100 to renew, both non-refundable.",
      "En établissement : l’Alberta indique 200 $ CA pour une nouvelle demande et 100 $ CA pour le renouvellement, non remboursables.",
    ],
    timing: [
      "Alberta says processing can take up to 30 business days once staff confirm the application is complete. That does not include site preparation.",
      "L’Alberta indique un délai pouvant atteindre 30 jours ouvrables après confirmation que le dossier est complet. Ce délai n’inclut pas la préparation des locaux.",
    ],
  },
  SK: {
    pathway: [
      "Choose a regulated centre or a family child care home; each has its own application pathway.",
      "Choisissez un centre réglementé ou un service de garde en milieu familial; chacun a sa propre démarche.",
    ],
    application: [
      "A centre application package includes a proposed development and projected operating budget. Use the separate home licence form if that is your model.",
      "Le dossier d’un centre comprend un projet d’aménagement et un budget d’exploitation prévisionnel. En milieu familial, utilisez le formulaire distinct.",
    ],
  },
  MB: {
    pathway: [
      "Before applying, attend Manitoba’s required information session for the kind of care you plan to offer. Centre and home-based sessions are separate.",
      "Avant de faire une demande, assistez à la séance d’information obligatoire pour votre type de garde. Les séances pour les centres et les garderies familiales sont distinctes.",
    ],
    orientationLinks: [
      {
        label: [
          "Centre or nursery school information session",
          "Séance d’information : centre ou prématernelle",
        ],
        url: [
          "https://www.manitoba.ca/education/childcare/centres_homeproviders/centrebased_childcare/orientation_session.html",
          "https://manitoba.ca/education/childcare/centres_homeproviders/centrebased_childcare/orientation_session.fr.html",
        ],
      },
      {
        label: [
          "Home-based child care information session",
          "Séance d’information : garderie familiale",
        ],
        url: [
          "https://www.gov.mb.ca/education/childcare/centres_homeproviders/homebased_childcare/print%2Corientation_session.html",
          "https://www.manitoba.ca/education/childcare/centres_homeproviders/homebased_childcare/orientation_session.fr.html",
        ],
      },
    ],
    application: [
      "Use the package for your setting. For a home, the province lists an application, a household/staff record, references and screening results.",
      "Utilisez la trousse de votre type de garde. En milieu familial, la province indique une demande, une fiche des résidents et du personnel, des références et des résultats de vérification.",
    ],
  },
  ON: {
    pathway: [
      "For a licensed centre or a home child care agency, register for Ontario’s Child Care Licensing System (CCLS).",
      "Pour un centre agréé ou une agence de garde en milieu familial, inscrivez-vous au Système de gestion des permis des services de garde d’enfants de l’Ontario.",
    ],
    application: [
      "Submit through CCLS and pay the non-refundable deposit. Prepare required approvals, floor plans and policies for the ministry’s review and site inspection.",
      "Déposez la demande dans le système et payez le dépôt non remboursable. Préparez les approbations, les plans et les politiques pour l’examen et l’inspection du ministère.",
    ],
    costs: [
      "Ontario lists new centre and agency licence fees of CA$200 to CA$450, depending on capacity or number of premises.",
      "L’Ontario indique de 200 à 450 $ CA pour un nouveau permis de centre ou d’agence, selon la capacité ou le nombre de locaux.",
    ],
  },
  QC: {
    sourceFr:
      "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reseau/developpement-reseau/ouverture-service-de-garde",
    pathway: [
      "Pick the right pathway: a CPE or subsidized daycare applies through a call for projects; a non-subsidized facility seeks a permit; family child care goes through its coordinating office.",
      "Choisissez votre démarche : un CPE ou une garderie subventionnée répond à un appel de projets; une installation non subventionnée demande un permis; la garde en milieu familial passe par le bureau coordonnateur.",
    ],
    application: [
      "Use the forms for that pathway and ask when to submit the educational program and supporting documents.",
      "Utilisez les formulaires de la démarche choisie et vérifiez quand transmettre le programme éducatif et les pièces justificatives.",
    ],
  },
  NB: {
    sourceFr:
      "https://www2.gnb.ca/content/gnb/fr/corporate/promo/investir-services-apprentissage-garde-jeunes-enfants/information-pour-les-exploitants.html",
    source:
      "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/information-for-operators.html",
    pathway: [
      "Choose the centre or home licence with the licensing team. New Brunswick treats designation as a separate question from licensing.",
      "Choisissez le permis de centre ou de service en milieu familial avec l’équipe responsable. Au Nouveau-Brunswick, la désignation est distincte du permis.",
    ],
    application: [
      "Use the corresponding centre or home form and operator manual; ask the licensing team when to prepare for the inspection.",
      "Utilisez le formulaire et le manuel correspondant au centre ou au milieu familial; demandez à l’équipe quand préparer l’inspection.",
    ],
  },
  NS: {
    source: "https://www.childcarenovascotia.ca/operators/current-operators/licensing",
    pathway: [
      "For a centre or family home agency, contact provincial Licensing Services. To provide family home care, start with a licensed agency that approves homes.",
      "Pour un centre ou une agence de garde en milieu familial, communiquez avec le service provincial des permis. Pour offrir la garde à domicile, adressez-vous à une agence autorisée qui approuve les milieux.",
    ],
    application: [
      "Ask the licensing team or agency which facility checks and records apply; confirm fire and health inspection requirements before renovations.",
      "Vérifiez auprès du service ou de l’agence les contrôles et documents exigés; confirmez les inspections incendie et de santé avant les travaux.",
    ],
  },
  PE: {
    pathway: [
      "Choose the centre category before using the Early Learning and Child Care Board’s online application.",
      "Choisissez la catégorie de centre avant d’utiliser la demande en ligne de la Commission de l’apprentissage et de la garde des jeunes enfants.",
    ],
    application: [
      "Prepare business, service and staffing plans, a floor plan and proof of zoning; follow the Board’s instructions for fire and health inspections.",
      "Préparez les plans d’affaires, de service, de dotation et des locaux, ainsi que la preuve de zonage; suivez les instructions de la Commission pour les inspections incendie et de santé.",
    ],
    costs: [
      "PEI’s centre application fee is CA$75 for up to 25 children and CA$150 for more than 25.",
      "Les frais de demande d’un centre à l’Î.-P.-É. sont de 75 $ CA pour 25 enfants ou moins et de 150 $ CA au-delà.",
    ],
    timing: [
      "The province does not give a fixed timeline on this page: inspection availability and any required renovations affect approval.",
      "La province ne donne pas de délai fixe sur cette page : l’accès aux inspections et les travaux requis influent sur l’approbation.",
    ],
  },
  NL: {
    source: "https://www.gov.nl.ca/education/childcare/resources/",
    pathway: [
      "For a centre, start with the regional Early Learning and Child Development Division. For regulated home care, ask about a direct licence or approval by a licensed agency.",
      "Pour un centre, adressez-vous à la division régionale responsable de l’apprentissage et du développement de la petite enfance. En milieu familial réglementé, renseignez-vous sur le permis direct ou l’approbation par une agence autorisée.",
    ],
    application: [
      "Use the provincial Child Care Licence Application or the forms the agency directs you to; confirm your inspection and certification requirements.",
      "Utilisez la demande provinciale de permis ou les formulaires indiqués par l’agence; confirmez les exigences d’inspection et de certification.",
    ],
  },
  YT: {
    sourceFr:
      "https://yukon.ca/fr/entreprises/permis-et-licences/obtenir-un-permis-de-service-de-garde-en-milieu-familial",
    source: "https://yukon.ca/en/doing-business/licensing/get-licence-your-family-day-home",
    pathway: [
      "For a family day home, request a licensing package from the Yukon department. Ask the department for the separate centre pathway if operating a centre.",
      "Pour un service de garde en milieu familial, demandez la trousse de permis au ministère du Yukon. Pour un centre, demandez au ministère la démarche correspondante.",
    ],
    application: [
      "For a family day home, prepare references, home health/fire/safety checks, a criminal-record check and a medical exam as listed in the package.",
      "En milieu familial, préparez les références, les inspections de santé, d’incendie et de sécurité, la vérification du casier judiciaire et l’examen médical indiqués dans la trousse.",
    ],
  },
  NT: {
    pathway: [
      "Contact the Early Childhood Consultant for your region for the steps that apply to your centre or home.",
      "Communiquez avec la personne-ressource régionale en petite enfance pour connaître la démarche applicable à votre centre ou à votre service en milieu familial.",
    ],
    application: [
      "For a centre, use the facility design and setup guide and ask your consultant for the appropriate application package and forms.",
      "Pour un centre, consultez le guide de conception et d’aménagement et demandez à votre personne-ressource la trousse et les formulaires appropriés.",
    ],
  },
  NU: {
    source:
      "https://www.gov.nu.ca/sites/default/files/documents/2024-11/ELCC_Licensed_Daycare_Handbook_-_EN2024_.pdf",
    pathway: [
      "For a centre, begin with your regional Early Childhood Officer. The Government of Nunavut handbook has the steps, form and document checklist.",
      "Pour un centre, commencez par la personne responsable de la petite enfance de votre région. Le guide du gouvernement du Nunavut présente les étapes, le formulaire et la liste des pièces.",
    ],
    application: [
      "Use the facility form in appendix A and the checklist in appendix D. The regional officer reviews supporting documents and schedules a site inspection.",
      "Utilisez le formulaire de l’établissement à l’annexe A et la liste à l’annexe D. La personne responsable examine les pièces et planifie une inspection.",
    ],
    costs: [
      "Nunavut’s centre handbook says it does not charge a licence application fee; that does not cover setup costs.",
      "Le guide des centres du Nunavut indique qu’aucuns frais de demande de permis ne sont exigés; cela n’inclut pas les frais d’installation.",
    ],
  },
};

export const LICENSING_STEPS = [
  "pathway",
  "space",
  "staff",
  "application",
  "inspection",
  "renewal",
] as const;
export type LicensingStep = (typeof LICENSING_STEPS)[number];
export const LICENSING_STORAGE_PREFIX = "kidease.daycare-licensing.v1.";
export const LICENSING_LAST_REGION_KEY = LICENSING_STORAGE_PREFIX + "last-region";

export function decodeLicensingProgress(raw: string | null): LicensingStep[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? LICENSING_STEPS.filter((id) => parsed.includes(id)) : [];
  } catch {
    return [];
  }
}
