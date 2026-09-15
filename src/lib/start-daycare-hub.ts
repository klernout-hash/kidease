/**
 * Official-source education for starting licensed child care in Canada.
 * Amounts are illustrative ceilings from government pages — never a KidEase
 * promise. Programs change; confirm on the linked site. No per-province routes.
 */

export const START_DAYCARE_REVIEWED = "September 2026";

export type StartDaycarePt = {
  code: string;
  nameEn: string;
  nameFr: string;
  aliases: readonly string[];
  licensingWhoEn: string;
  licensingWhoFr: string;
  licensingFirstEn: string;
  licensingFirstFr: string;
  licensingUrl: string;
  fundingEn: string;
  fundingFr: string;
  fundingUrl: string;
  competitive: boolean;
};

export const START_DAYCARE_PTS: readonly StartDaycarePt[] = [
  {
    code: "BC",
    nameEn: "British Columbia",
    nameFr: "Colombie-Britannique",
    aliases: ["bc", "british columbia", "colombie-britannique", "c.-b.", "cb"],
    licensingWhoEn: "Licensed under the Community Care and Assisted Living Act. Apply through your local health authority.",
    licensingWhoFr:
      "Permis en vertu de la Community Care and Assisted Living Act. Demandez auprès de votre régie de la santé.",
    licensingFirstEn:
      "Read the Child Care Licensing Regulation, then contact your health authority before you renovate. Home-based Group Care, Family, and In-Home Multi-Age licences are the typical start-up path.",
    licensingFirstFr:
      "Lisez le règlement sur les permis de garde, puis communiquez avec votre régie de la santé avant de rénover. Les permis à domicile (Group Care, Family, In-Home Multi-Age) sont le chemin habituel pour démarrer.",
    licensingUrl:
      "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/start-up-grants",
    fundingEn:
      "ChildCareBC Start-Up Grants are home-focused: typically $500 up front, then up to $500 per licensed space after a licence is issued and you join Child Care Operating Funding and, where eligible, CCFRI. School-age Operational Start Up exists separately. Subject to program rules and budget.",
    fundingFr:
      "Les subventions de démarrage ChildCareBC visent surtout le milieu familial : généralement 500 $ au départ, puis jusqu’à 500 $ par place permise après le permis et l’adhésion au financement de fonctionnement (et au CCFRI le cas échéant). Un fonds de démarrage pour la garde en milieu scolaire existe à part. Sous réserve des règles et du budget.",
    fundingUrl:
      "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/start-up-grants",
    competitive: true,
  },
  {
    code: "AB",
    nameEn: "Alberta",
    nameFr: "Alberta",
    aliases: ["ab", "alberta"],
    licensingWhoEn: "Government of Alberta licences facility-based programs and family day home agencies.",
    licensingWhoFr: "Le gouvernement de l’Alberta délivre les permis des programmes en installation et des agences de garderies familiales.",
    licensingFirstEn:
      "Start at Alberta’s “Start a childcare program” page. Confirm affordability-funding eligibility before you apply — new applicants are often not eligible. New family day home agency licences are not being accepted at this time (confirm on the official page).",
    licensingFirstFr:
      "Commencez par la page « Start a childcare program ». Confirmez l’admissibilité au financement d’abordabilité avant de demander — les nouveaux demandeurs sont souvent inadmissibles. Les nouvelles demandes d’agence de garderies familiales ne sont pas acceptées pour le moment (confirmez sur le site officiel).",
    licensingUrl: "https://www.alberta.ca/start-a-childcare-program",
    fundingEn:
      "Space Creation and Building Blocks capital intakes have been closed. Affordability Grant (operating) is capped and tied to federal-provincial space limits. New licence applicants are typically not eligible for affordability funding. KidEase does not award these grants.",
    fundingFr:
      "Les appels Space Creation et Building Blocks sont fermés. La subvention d’abordabilité (fonctionnement) est plafonnée et liée aux cibles fédérales-provinciales. Les nouveaux demandeurs de permis sont généralement inadmissibles. KidEase n’accorde pas ces subventions.",
    fundingUrl: "https://www.alberta.ca/funding-and-supports",
    competitive: true,
  },
  {
    code: "SK",
    nameEn: "Saskatchewan",
    nameFr: "Saskatchewan",
    aliases: ["sk", "saskatchewan"],
    licensingWhoEn: "Ministry of Education licences regulated centres and homes.",
    licensingWhoFr: "Le ministère de l’Éducation délivre les permis des centres et milieux familiaux réglementés.",
    licensingFirstEn:
      "Submit a Community Needs Assessment and apply to start a regulated centre. For-profit operators may apply for a licence but are not eligible for ministry development or operating grants.",
    licensingFirstFr:
      "Soumettez une évaluation des besoins de la communauté et une demande pour un centre réglementé. Les entreprises à but lucratif peuvent demander un permis, mais ne sont pas admissibles aux subventions ministérielles de développement ou de fonctionnement.",
    licensingUrl:
      "https://www.saskatchewan.ca/business/entrepreneurs-start-or-exit-a-business/start-a-business/managing-a-child-care-business/start-a-regulated-child-care-centre/apply-to-start-a-regulated-child-care-centre",
    fundingEn:
      "Eligible non-profit, co-op, or municipal centres may receive Space Development Capital Funding (up to about $13,360/space) and a Start-Up Grant (about $1,360/space for equipment), plus operating and $10-a-day parent-fee reduction grants. Amounts and eligibility are ministry decisions and can change.",
    fundingFr:
      "Les centres sans but lucratif, coopératifs ou municipaux admissibles peuvent recevoir un financement d’immobilisations (jusqu’à environ 13 360 $/place) et une subvention de démarrage (environ 1 360 $/place pour l’équipement), plus le fonctionnement et la réduction des frais à 10 $ par jour. Les montants et l’admissibilité relèvent du ministère et peuvent changer.",
    fundingUrl:
      "https://www.saskatchewan.ca/business/entrepreneurs-start-or-exit-a-business/start-a-business/managing-a-child-care-business/start-a-regulated-child-care-centre/grants-for-child-care-centres",
    competitive: true,
  },
  {
    code: "MB",
    nameEn: "Manitoba",
    nameFr: "Manitoba",
    aliases: ["mb", "manitoba"],
    licensingWhoEn: "Early Learning and Child Care Division, Manitoba Education and Early Childhood Learning.",
    licensingWhoFr: "Division de l’apprentissage et de la garde des jeunes enfants, Éducation et Apprentissage de la petite enfance du Manitoba.",
    licensingFirstEn:
      "Attend a required information session, then apply for a licence. Centres must follow The Community Child Care Standards Act. Contact cdcinfo@gov.mb.ca to register for a session.",
    licensingFirstFr:
      "Assistez à une séance d’information obligatoire, puis demandez un permis. Les centres suivent la Loi sur les normes des services de garde. Inscrivez-vous à une séance via cdcinfo@gov.mb.ca.",
    licensingUrl: "https://manitoba.ca/education/childcare/centres_homeproviders/centrebased_childcare.html",
    fundingEn:
      "Eligible licensed non-profit centres and family/group homes may apply for a one-time start-up grant within one year of licensing new or expanded spaces — typically about $300/home space, $450/infant, preschool or school-age centre space, $245/nursery-school space — for licensing equipment, not wages or rent. Operating grants exist for eligible non-profits. Discretionary and budget-limited. Ask your Child Care Coordinator before purchasing.",
    fundingFr:
      "Les centres sans but lucratif et les milieux familiaux/de groupe permis peuvent demander une subvention de démarrage unique dans l’année suivant le permis de nouvelles places — généralement environ 300 $/place en milieu familial, 450 $/place en pouponnière, préscolaire ou parascolaire, 245 $/place en prématernelle — pour l’équipement lié au permis, pas les salaires ni le loyer. Des subventions de fonctionnement existent pour les OBNL admissibles. Discrétionnaire et limitée au budget. Parlez à votre coordonnateur avant d’acheter.",
    fundingUrl: "https://manitoba.ca/education/childcare/centres_homeproviders/providers_resources/grants.html",
    competitive: true,
  },
  {
    code: "ON",
    nameEn: "Ontario",
    nameFr: "Ontario",
    aliases: ["on", "ontario"],
    licensingWhoEn: "Ontario Ministry of Education licences centres and home child care agencies under the CCEYA.",
    licensingWhoFr: "Le ministère de l’Éducation de l’Ontario délivre les permis des centres et des agences de garde en milieu familial (LPJE).",
    licensingFirstEn:
      "Register on the Child Care Licensing System (CCLS), watch the orientation, and apply online. You do not need to own or lease the site before applying, but you must give a proposed address and zoning proof. A licence can take many months.",
    licensingFirstFr:
      "Inscrivez-vous au système de délivrance des permis (CCLS), visionnez l’orientation et postulez en ligne. Vous n’avez pas besoin d’être propriétaire ou locataire avant de postuler, mais vous devez fournir une adresse proposée et une preuve de zonage. Un permis peut prendre plusieurs mois.",
    licensingUrl: "https://www.ontario.ca/page/apply-or-renew-child-care-licence",
    fundingEn:
      "CWELCC Start-up Grants are administered by your local CMSM or DSSAB under Directed Growth — not by KidEase and not as a walk-in provincial form. Centre projects have been described as up to about $350,000 per 20 spaces; homes up to about $1,200/space (often capped around $7,200 per provider). Caps, spend deadlines, and who is invited change. Confirm with your service system manager.",
    fundingFr:
      "Les subventions de démarrage AGJE sont gérées par votre CMSM ou SSAB local selon la croissance dirigée — pas par KidEase et pas comme un formulaire provincial libre-service. Les projets en centre ont été décrits jusqu’à environ 350 000 $ par 20 places; les milieux familiaux jusqu’à environ 1 200 $/place (souvent plafonnés autour de 7 200 $ par responsable). Plafonds, délais et admissibilité changent. Confirmez auprès de votre gestionnaire de système de services.",
    fundingUrl: "https://www.ontario.ca/page/child-care-and-early-years",
    competitive: true,
  },
  {
    code: "QC",
    nameEn: "Quebec",
    nameFr: "Québec",
    aliases: ["qc", "quebec", "québec"],
    licensingWhoEn:
      "Ministère de la Famille issues permits for CPEs and garderies. Home educational childcare (RSGE) is recognized by a bureau coordonnateur — a different path than a centre permit.",
    licensingWhoFr:
      "Le ministère de la Famille délivre les permis de CPE et de garderies. Les RSGE sont reconnues par un bureau coordonnateur — un chemin distinct du permis d’installation.",
    licensingFirstEn:
      "Québec is its own system (not CWELCC fee rules). To open a CPE or a subsidized garderie, apply through a project call for subsidized spaces. A non-subsidized garderie applies directly to the ministry for a permit (application fee applies). Do not start build-out before written ministry authorization.",
    licensingFirstFr:
      "Le Québec a son propre système (pas les mêmes règles de tarifs AGJE). Pour un CPE ou une garderie subventionnée, déposez une demande dans un appel de projets de places subventionnées. Une garderie non subventionnée demande son permis directement au Ministère (des frais s’appliquent). N’entreprenez pas de travaux avant une autorisation écrite.",
    licensingUrl:
      "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reseau/developpement-reseau/ouverture-service-de-garde",
    fundingEn:
      "Subsidized spaces (reduced-contribution) are awarded through competitive project calls — not a start-up cheque from KidEase. Non-subsidized garderies may still operate with a permit; parents may use the Revenu Québec childcare tax credit. Confirm the current call on Québec.ca.",
    fundingFr:
      "Les places à contribution réduite sont attribuées par appels de projets concurrentiels — pas un chèque de démarrage de KidEase. Une garderie non subventionnée peut tout de même obtenir un permis; les parents peuvent utiliser le crédit d’impôt de Revenu Québec. Confirmez l’appel en cours sur Québec.ca.",
    fundingUrl:
      "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reseau/developpement-reseau/appels-projets",
    competitive: true,
  },
  {
    code: "NB",
    nameEn: "New Brunswick",
    nameFr: "Nouveau-Brunswick",
    aliases: ["nb", "new brunswick", "nouveau-brunswick"],
    licensingWhoEn: "Department of Education and Early Childhood Development licences ELC centres and homes.",
    licensingWhoFr: "Le ministère de l’Éducation et du Développement de la petite enfance délivre les permis des SGPE (centres et milieux familiaux).",
    licensingFirstEn:
      "Apply for a licence through your regional Early Learning and Child Care Services office. Designation (for Canada-wide fee and operating supports) is a separate, often competitive, step. A facility can be licensed without designation.",
    licensingFirstFr:
      "Demandez un permis à votre bureau régional des services de petite enfance. La désignation (pour les aides tarifaires et de fonctionnement) est une étape distincte, souvent concurrentielle. Un établissement peut être permis sans désignation.",
    licensingUrl:
      "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/operator.html",
    fundingEn:
      "Operating grants and parent-fee supports go to designated facilities. Capital / designation start-up funding has been offered through calls for proposals and can close. Confirm current designation and capital intakes on the official operators page — do not assume a start-up grant is open.",
    fundingFr:
      "Les subventions de fonctionnement et le soutien tarifaire vont aux établissements désignés. Le financement d’immobilisations / de démarrage a été offert par appels de propositions et peut être fermé. Confirmez les appels en cours sur la page officielle — ne présumez pas qu’une subvention de démarrage est ouverte.",
    fundingUrl:
      "https://www2.gnb.ca/content/gnb/en/corporate/promo/investing-in-early-learning-and-child-care/creating-designated-child-care-spaces.html",
    competitive: true,
  },
  {
    code: "NS",
    nameEn: "Nova Scotia",
    nameFr: "Nouvelle-Écosse",
    aliases: ["ns", "nova scotia", "nouvelle-écosse", "nouvelle-ecosse"],
    licensingWhoEn: "Department of Education and Early Childhood Development licences centres; family homes affiliate with a Family Home Child Care Agency.",
    licensingWhoFr:
      "Le ministère de l’Éducation et du Développement de la petite enfance délivre les permis des centres; les milieux familiaux s’affilient à une agence de garde en milieu familial.",
    licensingFirstEn:
      "For a centre, work with Licensing Services on a proposal before you build. For a home, contact the Family Home Child Care Agency in your area — they coach the licence path and administer home start-up grants.",
    licensingFirstFr:
      "Pour un centre, travaillez avec les Services de permis sur une proposition avant de construire. Pour un milieu familial, communiquez avec l’agence de votre région — elle accompagne le permis et administre la subvention de démarrage à domicile.",
    licensingUrl: "https://www.childcarenovascotia.ca/operators/future-operators/family-home",
    fundingEn:
      "Family Home Start Up has been described as a one-time grant of up to about $7,500 via the local agency. Minor/Major infrastructure programs for not-for-profit centre spaces have had intakes that close when funds are allocated (Minor was listed as closed). Confirm Creating Spaces on Child Care Nova Scotia.",
    fundingFr:
      "Le démarrage en milieu familial a été décrit comme une subvention unique jusqu’à environ 7 500 $ via l’agence locale. Les programmes d’infrastructure mineure/majeure pour les places OBNL ont des appels qui ferment lorsque les fonds sont alloués (le programme mineur a été indiqué comme fermé). Confirmez « Creating Spaces » sur Child Care Nova Scotia.",
    fundingUrl: "https://www.childcarenovascotia.ca/creating-spaces",
    competitive: true,
  },
  {
    code: "PE",
    nameEn: "Prince Edward Island",
    nameFr: "Île-du-Prince-Édouard",
    aliases: ["pe", "pei", "prince edward island", "île-du-prince-édouard", "ile-du-prince-edouard"],
    licensingWhoEn: "Early Learning and Child Care Board licences centres and family home centres.",
    licensingWhoFr: "La Commission de l’apprentissage et de la garde des jeunes enfants délivre les permis des centres et des milieux familiaux.",
    licensingFirstEn:
      "Apply online for an Early Childhood Centre (or family home) licence and upload the guideline package (plans, checks, zoning, fire and public health). Designation as an Early Years Centre is a further step for the publicly managed fee model.",
    licensingFirstFr:
      "Demandez en ligne un permis de centre de la petite enfance (ou de milieu familial) et téléversez le dossier (plans, vérifications, zonage, incendie et santé publique). La désignation de Centre de la petite enfance est une étape supplémentaire pour le modèle tarifaire public.",
    licensingUrl: "https://www.princeedwardisland.ca/en/service/early-learning-and-child-care-centre-licensing",
    fundingEn:
      "A Non-Profit Organization Child Care Start-Up Grant (up to about $200,000 for eligible construction/renovation) had a public intake that closed 31 October 2025. Operating grants exist for designated Early Years and family home centres. Check the official licensing and Early Years pages for any open intake — do not treat a closed grant as current money.",
    fundingFr:
      "Une subvention de démarrage pour OBNL (jusqu’à environ 200 000 $ pour construction/rénovation admissible) a eu un appel clos le 31 octobre 2025. Des subventions de fonctionnement existent pour les centres désignés. Vérifiez les pages officielles pour tout appel ouvert — ne traitez pas une subvention fermée comme de l’argent actuel.",
    fundingUrl: "https://www.princeedwardisland.ca/en/information/education-and-early-years/licensed-early-learning-and-child-care",
    competitive: true,
  },
  {
    code: "NL",
    nameEn: "Newfoundland and Labrador",
    nameFr: "Terre-Neuve-et-Labrador",
    aliases: ["nl", "newfoundland", "labrador", "terre-neuve"],
    licensingWhoEn: "Department of Education licences and regulates child care under the Child Care Act.",
    licensingWhoFr: "Le ministère de l’Éducation délivre les permis et encadre la garde en vertu de la Child Care Act.",
    licensingFirstEn:
      "Start on the provincial child care site, then talk to regional licensing about a centre or family home. Not-for-profit groups expanding spaces often begin with a community needs assessment.",
    licensingFirstFr:
      "Commencez sur le site provincial de la garde, puis parlez au bureau régional des permis pour un centre ou un milieu familial. Les OBNL qui ajoutent des places commencent souvent par une évaluation des besoins.",
    licensingUrl: "https://www.gov.nl.ca/education/childcare/",
    fundingEn:
      "The Child Care Capacity Initiative supports eligible not-for-profits and municipalities with start-up, renovation, and equipment to meet licensing — especially in underserved areas. An Operating Grant Program supports participating regulated services in the reduced-fee model. Confirm current eligibility on the official not-for-profit child care page.",
    fundingFr:
      "L’initiative de capacité en garde aide les OBNL et municipalités admissibles pour le démarrage, les rénovations et l’équipement liés au permis — surtout dans les régions moins desservies. Un programme de subvention de fonctionnement appuie les services réglementés participants au modèle de frais réduits. Confirmez l’admissibilité sur la page officielle.",
    fundingUrl: "https://www.childcare.gov.nl.ca/public/ccr/notforprofit",
    competitive: true,
  },
  {
    code: "YT",
    nameEn: "Yukon",
    nameFr: "Yukon",
    aliases: ["yt", "yukon"],
    licensingWhoEn: "Yukon Education (Early Learning and Child Care) licences centres and family day homes.",
    licensingWhoFr: "Éducation Yukon (apprentissage et garde des jeunes enfants) délivre les permis des centres et des garderies familiales.",
    licensingFirstEn:
      "Contact the Early Learning and Child Care Unit before you apply. Family day homes are licensed individually. Confirm inspector requirements for space, health, and safety.",
    licensingFirstFr:
      "Communiquez avec l’unité d’apprentissage et de garde avant de postuler. Les garderies familiales sont permises individuellement. Confirmez les exigences de l’inspecteur pour l’espace, la santé et la sécurité.",
    licensingUrl: "https://yukon.ca/en/find-child-care",
    fundingEn:
      "Yukon’s Enhancement Fund has included start-up support for centres and family day homes that are licensing. Licensed programs also participate in universal fee-reduction funding. Amounts and who can apply change — confirm on Yukon.ca (Enhancement Fund / start-up funding).",
    fundingFr:
      "Le Fonds d’amélioration du Yukon a inclus un soutien au démarrage pour les centres et garderies familiales en cours de permis. Les programmes permis participent aussi au financement de réduction des frais. Les montants et l’admissibilité changent — confirmez sur Yukon.ca.",
    fundingUrl: "https://yukon.ca/en/health-and-wellness/work/apply-enhancement-fund-your-child-care-program",
    competitive: true,
  },
  {
    code: "NT",
    nameEn: "Northwest Territories",
    nameFr: "Territoires du Nord-Ouest",
    aliases: ["nt", "nwt", "northwest territories", "territoires du nord-ouest"],
    licensingWhoEn: "Education, Culture and Employment licences programs caring for four or more children.",
    licensingWhoFr: "Éducation, Culture et Formation délivre les permis des programmes qui accueillent quatre enfants ou plus.",
    licensingFirstEn:
      "Contact the Early Childhood Consultant in your region before you apply. They walk you through facility, fire, health, zoning, insurance, and WSCC requirements.",
    licensingFirstFr:
      "Communiquez avec le conseiller de la petite enfance de votre région avant de postuler. Il vous guide pour l’établissement, l’incendie, la santé, le zonage, l’assurance et la CSTIT.",
    licensingUrl: "https://www.ece.gov.nt.ca/en/starting-and-operating-licensed-centre-based-program",
    fundingEn:
      "The New Child Care Spaces Fund offers application-based start-up equipment amounts that vary by age group and zone (illustrative official ranges have included about $500–$4,200 per space). The Early Childhood Infrastructure Fund supports larger builds/renos and is budget-limited. Contact your consultant first.",
    fundingFr:
      "Le Fonds pour de nouvelles places offre, sur demande, des montants d’équipement de démarrage selon l’âge et la zone (les fourchettes officielles illustratives ont inclus environ 500 $ à 4 200 $ par place). Le Fonds d’infrastructure de la petite enfance appuie les plus gros travaux et est limité au budget. Parlez d’abord à votre conseiller.",
    fundingUrl: "https://www.ece.gov.nt.ca/en/new-child-care-spaces-fund-centre-based",
    competitive: true,
  },
  {
    code: "NU",
    nameEn: "Nunavut",
    nameFr: "Nunavut",
    aliases: ["nu", "nunavut"],
    licensingWhoEn: "Department of Education (Early Learning and Child Care) licences centres and family home daycares.",
    licensingWhoFr: "Le ministère de l’Éducation (apprentissage et garde) délivre les permis des centres et des garderies familiales.",
    licensingFirstEn:
      "Read the licensed daycare handbook, then contact your regional Early Childhood Officer. You will need plans, fire and health reports, zoning, insurance, and an emergency plan before a licence.",
    licensingFirstFr:
      "Lisez le guide des garderies permises, puis communiquez avec l’agente régionale de la petite enfance. Il faudra des plans, des rapports incendie et santé, le zonage, l’assurance et un plan d’urgence.",
    licensingUrl: "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
    fundingEn:
      "Nunavut offers one-time start-up funding for opening, expanding, or relocating a licensed centre (and for individuals starting a licensed family home). The amount follows a departmental formula and available budget — not a published flat cheque. Separate infrastructure calls have funded new spaces first-come until funds run out. Email ELCCAdmin@gov.nu.ca or your Early Childhood Officer.",
    fundingFr:
      "Le Nunavut offre un financement de démarrage unique pour ouvrir, agrandir ou déménager un centre permis (et pour une garderie familiale permise). Le montant suit une formule ministérielle et le budget disponible — pas un chèque fixe publié. Des appels d’infrastructure ont financé de nouvelles places jusqu’à épuisement des fonds. Écrivez à ELCCAdmin@gov.nu.ca ou à votre agente.",
    fundingUrl: "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
    competitive: true,
  },
];

export function filterStartDaycarePts(query: string): StartDaycarePt[] {
  const q = query.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!q) return [...START_DAYCARE_PTS];
  return START_DAYCARE_PTS.filter((pt) => {
    const hay = [pt.code, pt.nameEn, pt.nameFr, ...pt.aliases]
      .join(" ")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    return hay.includes(q);
  });
}

export function startDaycarePt(code: string | null | undefined): StartDaycarePt | undefined {
  const v = (code || "").trim().toUpperCase();
  return START_DAYCARE_PTS.find((pt) => pt.code === v);
}
