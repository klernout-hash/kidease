/**
 * Province and territory cards. Wording follows the 22 November 2026 research note.
 * Costs appear only where that note quotes a published amount.
 */
import type { BgJurisdiction, BgRole, GuideCheck, GuideSource } from "./background-check-guide.ts";

const READ = "2026-11-22";
const RCMP = "https://www.rcmp.ca/en/criminal-records/criminal-record-checks/where-go";
const RCMP_VSC = "https://www.rcmp.ca/en/criminal-records/criminal-record-checks/vulnerable-sector-checks";

const rcmpLink = {
  labelEn: "RCMP: where to go",
  labelFr: "GRC : où s’adresser",
  href: RCMP,
};

const rcmpSource: GuideSource = {
  label: "RCMP, Vulnerable sector checks and Where to go",
  href: RCMP_VSC,
  asOf: READ,
};

function localCost(enExtra = "", frExtra = ""): { costEn: string; costFr: string; costPublished: boolean } {
  return {
    costPublished: false,
    costEn: `Not published as one provincial fee. Confirm with the local police service.${enExtra}`,
    costFr: `Pas de tarif provincial unique publié. Confirmez auprès du service de police local.${frExtra}`,
  };
}

const ALL_ROLES: readonly BgRole[] = [
  "centre_staff",
  "volunteer_student",
  "home_provider",
  "home_resident",
  "operator",
];

function bc(): BgJurisdiction {
  const cost = {
    costPublished: true,
    costEn:
      "Published CRRP fees: $28 for a new employee check, $0 for volunteers, and $0 to share an eligible past CRRP clearance. Fingerprints, if the program asks for them, cost extra. Fees are not refundable. The person pays unless the organization pays.",
    costFr:
      "Frais publiés du CRRP : 28 $ pour un nouvel employé, 0 $ pour les bénévoles, et 0 $ pour partager une attestation CRRP encore admissible. Les empreintes, si le programme les demande, coûtent en plus. Les frais ne sont pas remboursés. La personne paie, sauf si l’organisation paie.",
  };
  const check: GuideCheck = {
    id: "bc_crrp",
    kind: "crrp",
    roles: ALL_ROLES,
    titleEn: "Criminal Records Review Program (CRRP)",
    titleFr: "Programme de vérification des casiers judiciaires (CRRP)",
    whatEn:
      "People 12 or older who work with or spend time with children are screened through the provincial Criminal Records Review Program. That includes employees, volunteers, contractors, practicum students, and people 12 or older who spend time at the facility, such as family members or tenants in a family or in-home program. This is a CRRP check for working with children. It is not a local-police vulnerable sector check.",
    whatFr:
      "Les personnes de 12 ans ou plus qui travaillent auprès d’enfants ou passent du temps avec eux passent par le Programme de vérification des casiers judiciaires. Cela comprend les employés, les bénévoles, les entrepreneurs, les stagiaires, et les personnes de 12 ans ou plus qui passent du temps dans le service, par exemple des membres de la famille ou des locataires en milieu familial. C’est une vérification du casier judiciaire du CRRP pour travailler auprès d’enfants. Ce n’est pas une vérification du secteur vulnérable de la police locale.",
    whenEn:
      "Before or as soon as the person should be screened. Once the check has been submitted, the organization is considered in compliance with the Criminal Records Review Act and the person may work while waiting, unless the centre’s own policy says otherwise. Repeat every 5 years, and again after a new charge or conviction.",
    whenFr:
      "Avant le début, ou dès que la personne doit être vérifiée. Une fois la demande envoyée, l’organisation est considérée conforme à la Criminal Records Review Act et la personne peut travailler en attendant, sauf si la politique du centre dit autre chose. À refaire tous les 5 ans, et après une nouvelle accusation ou condamnation.",
    whereEn:
      "The centre starts the check in the CRRP organization portal by sending an email invitation, or a secure link and access code. The person then applies online, usually with BC Services Card Login.",
    whereFr:
      "Le centre lance la vérification dans le portail CRRP, par invitation courriel ou par un lien sécurisé et un code d’accès. La personne fait ensuite la demande en ligne, en général avec la carte des services de la C.-B.",
    links: [
      {
        labelEn: "Apply for a criminal record check",
        labelFr: "Faire une demande de vérification du casier judiciaire",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/applicants/apply",
      },
      {
        labelEn: "Screen applicants (organizations)",
        labelFr: "Vérifier les candidats (organisations)",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/organizations/screen",
      },
      {
        labelEn: "Process and fees",
        labelFr: "Démarche et frais",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/applicants/process",
      },
    ],
    documentsEn:
      "The invitation or access code, and identity through BC Services Card Login, or two pieces of government ID if the person lives outside B.C. If the person cannot use the card, the organization verifies ID.",
    documentsFr:
      "L’invitation ou le code d’accès, et l’identité avec la carte des services de la C.-B., ou deux pièces d’identité gouvernementales si la personne habite hors de la C.-B. Si la carte ne peut pas servir, l’organisation vérifie l’identité.",
    ...cost,
    renewal: { mode: "years", years: 5 },
    renewalEn:
      "Every 5 years, and sooner after a new charge or conviction. A past CRRP clearance can sometimes be shared if it is under 5 years old, the “works with” type matches, and the name and date of birth still match. Police or RCMP checks cannot be shared into CRRP. A name change cannot be shared.",
    renewalFr:
      "Tous les 5 ans, et plus tôt après une nouvelle accusation ou condamnation. Une attestation CRRP antérieure peut parfois être partagée si elle a moins de 5 ans, si le type « travaille auprès d’enfants » correspond, et si le nom et la date de naissance sont les mêmes. Une vérification de la police ou de la GRC ne peut pas être versée au CRRP. Un changement de nom ne peut pas être partagé.",
    keeperEn:
      "The organization is told whether the person is cleared. It cannot share the clearance letter with the person. The centre keeps its CRRP records as licensing requires. KidEase does not store a clearance letter as if it were a police vulnerable sector check.",
    keeperFr:
      "L’organisation est informée si la personne est autorisée. Elle ne peut pas remettre la lettre d’autorisation à la personne. Le centre conserve ses dossiers CRRP comme le permis l’exige. KidEase ne conserve pas une lettre d’autorisation comme s’il s’agissait d’une vérification policière du secteur vulnérable.",
    unconfirmed: false,
    sources: [
      {
        label: "B.C. CRRP apply page, last updated 26 June 2026",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/applicants/apply",
        asOf: "2026-06-26",
      },
      {
        label: "B.C. CRRP organization page, last updated 1 May 2025",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/organizations/screen",
        asOf: "2025-05-01",
      },
      {
        label: "B.C. CRRP process and fees, 26 June 2026",
        href: "https://www2.gov.bc.ca/gov/content/safety/crime-prevention/criminal-record-check/applicants/process",
        asOf: "2026-06-26",
      },
      { label: "Criminal Records Review Act, as summarized in the KidEase research note", asOf: READ },
    ],
  };
  return {
    code: "BC",
    summaryEn:
      "British Columbia uses the Criminal Records Review Program, not a local-police vulnerable sector check. The centre starts the check. KidEase cannot run it.",
    summaryFr:
      "La Colombie-Britannique utilise le Programme de vérification des casiers judiciaires, pas une vérification du secteur vulnérable de la police locale. Le centre lance la demande. KidEase ne peut pas la faire.",
    checks: [check],
    roleNotes: {},
  };
}

function alberta(): BgJurisdiction {
  const police = localCost();
  const crc: GuideCheck = {
    id: "ab_crc_vsc",
    kind: "crc_vsc",
    roles: ALL_ROLES,
    titleEn: "Criminal record check with a vulnerable sector search",
    titleFr: "Vérification du casier judiciaire, y compris une recherche dans le secteur vulnérable",
    whatEn:
      "Centres: the licence applicant (or every director and officer of a corporation), every staff member, and every volunteer with unsupervised access provide a criminal record check that includes a vulnerable sector search. Staff and unsupervised volunteers must be adults. A child intervention record check is not a licensing-regulation staff rule. A centre may still ask for one as its own policy. Family day homes: the educator, agency staff, and every adult who lives in the home or is there regularly during operating hours provide the same check to the licensed family day home agency.",
    whatFr:
      "Centres : le demandeur de permis (ou chaque administrateur et dirigeant d’une société), chaque membre du personnel et chaque bénévole avec accès non supervisé fournissent une vérification du casier judiciaire qui comprend une recherche dans le secteur vulnérable. Le personnel et les bénévoles non supervisés doivent être adultes. Une vérification du dossier d’intervention auprès des enfants n’est pas une règle de permis pour le personnel. Un centre peut quand même la demander dans sa propre politique. Garderies familiales : l’éducateur ou l’éducatrice, le personnel de l’agence, et chaque adulte qui habite le domicile ou s’y trouve régulièrement pendant les heures d’ouverture fournissent la même vérification à l’agence de garderie familiale permise.",
    whenEn:
      "Centres: new staff and unsupervised volunteers provide the check within 8 weeks of starting and must not have unsupervised access until it is on file. It must not be earlier than 6 months before the start. Then every 3 years. At first licence, not earlier than 6 months before the application. A renewal needs a new check if the last one is more than 3 years old. Family day homes: not earlier than 6 months before the contract or employment starts, before approval and before children are cared for, then every 3 years. Residents away for a long time complete the check, or do it as soon as they return. Long-term visitors must not be left unsupervised.",
    whenFr:
      "Centres : le nouveau personnel et les bénévoles non supervisés fournissent la vérification dans les 8 semaines suivant le début et n’ont pas d’accès non supervisé tant qu’elle n’est pas au dossier. Elle ne doit pas dater de plus de 6 mois avant le début. Puis tous les 3 ans. Pour un premier permis, pas plus de 6 mois avant la demande. Au renouvellement, une nouvelle vérification est exigée si la dernière a plus de 3 ans. Garderies familiales : pas plus de 6 mois avant le début du contrat ou de l’emploi, avant l’approbation et avant de garder des enfants, puis tous les 3 ans. Une personne absente longtemps fait la vérification, ou dès son retour. Un visiteur de longue durée ne doit pas rester sans supervision.",
    whereEn:
      "The police service or RCMP detachment where the person lives. Ask the centre for a letter that describes the job as a position of trust with children. Family day home results go to the licensed agency as well as the file the agency requires.",
    whereFr:
      "Le service de police ou le détachement de la GRC où la personne habite. Demandez au centre une lettre qui décrit le poste comme un poste de confiance auprès des enfants. En garderie familiale, les résultats vont aussi à l’agence permise.",
    links: [rcmpLink],
    documentsEn: "Government ID, the centre’s letter, and payment if the police require it. Fingerprints only if the police ask.",
    documentsFr: "Une pièce d’identité gouvernementale, la lettre du centre, et le paiement si la police l’exige. Empreintes seulement si la police les demande.",
    ...police,
    renewal: { mode: "years", years: 3 },
    renewalEn: "Every 3 years after the start, for centre staff, unsupervised volunteers, family day home educators, agency staff, and adult residents.",
    renewalFr: "Tous les 3 ans après le début, pour le personnel du centre, les bénévoles non supervisés, les éducateurs en milieu familial, le personnel de l’agence et les résidents adultes.",
    keeperEn:
      "The centre (licence holder) must have the results in the staff file for licensing. A family day home agency keeps what its standards require. KidEase may record the issued and expiry dates for reminders. KidEase does not run the check.",
    keeperFr:
      "Le centre (titulaire de permis) doit avoir les résultats dans le dossier du personnel pour le permis. Une agence de garderie familiale garde ce que ses normes exigent. KidEase peut noter les dates d’émission et d’échéance pour les rappels. KidEase ne fait pas la vérification.",
    unconfirmed: false,
    sources: [
      { label: "Alta. Reg. 143/2008, centre staff and licence applicant rules", asOf: READ },
      { label: "Family Day Home Standards Manual for Alberta, September 2025, Standard 3", asOf: "2025-09-01" },
      rcmpSource,
    ],
  };
  const youth: GuideCheck = {
    id: "ab_under18_disclosure",
    kind: "under18_disclosure",
    roles: ["home_resident"],
    titleEn: "Signed disclosure for a resident under 18",
    titleFr: "Déclaration signée pour un résident de moins de 18 ans",
    whatEn:
      "In a family day home, a resident under 18 gives a signed disclosure of prior criminal involvement. That is not a police check, unless the agency’s process says otherwise.",
    whatFr:
      "En garderie familiale, un résident de moins de 18 ans remet une déclaration signée sur une implication criminelle antérieure. Ce n’est pas une vérification policière, sauf si le processus de l’agence dit autre chose.",
    whenEn: "With the home’s approval papers. No police-check interval is published for this disclosure.",
    whenFr: "Avec les documents d’approbation du milieu. Aucun intervalle de vérification policière n’est publié pour cette déclaration.",
    whereEn: "The licensed family day home agency’s own form. Not a self-serve police vulnerable sector check.",
    whereFr: "Le formulaire de l’agence de garderie familiale permise. Pas une vérification du secteur vulnérable en libre-service.",
    links: [],
    documentsEn: "The agency’s disclosure form, signed.",
    documentsFr: "Le formulaire de déclaration de l’agence, signé.",
    costPublished: false,
    costEn: "No fee is published for this disclosure in the standards manual.",
    costFr: "Aucun frais n’est publié pour cette déclaration dans le manuel de normes.",
    renewal: { mode: "none_published" },
    renewalEn: "No renewal interval is published for the under-18 disclosure.",
    renewalFr: "Aucun intervalle de renouvellement n’est publié pour la déclaration des moins de 18 ans.",
    keeperEn: "The licensed family day home agency keeps the signed disclosure.",
    keeperFr: "L’agence de garderie familiale permise conserve la déclaration signée.",
    unconfirmed: false,
    sources: [{ label: "Family Day Home Standards Manual for Alberta, September 2025, Standard 3", asOf: "2025-09-01" }],
  };
  return {
    code: "AB",
    summaryEn:
      "Alberta asks for a criminal record check that includes a vulnerable sector search. Centre rules are in Alta. Reg. 143/2008. Family day home rules are in the September 2025 standards manual.",
    summaryFr:
      "L’Alberta demande une vérification du casier judiciaire qui comprend une recherche dans le secteur vulnérable. Les règles des centres sont dans le Alta. Reg. 143/2008. Les règles des garderies familiales sont dans le manuel de normes de septembre 2025.",
    checks: [crc, youth],
    roleNotes: {},
  };
}

function saskatchewan(): BgJurisdiction {
  const police = localCost(
    " The centre’s written policy says who pays.",
    " La politique écrite du centre dit qui paie.",
  );
  const crc: GuideCheck = {
    id: "sk_crc_vsc",
    kind: "crc_vsc",
    roles: ["centre_staff", "home_provider", "home_resident", "operator"],
    titleEn: "Criminal record check with a vulnerable sector check",
    titleFr: "Recherche de casier judiciaire avec vérification du secteur vulnérable",
    whatEn:
      "Centres: every employee, before they are hired. Homes: the provider and every adult (18+) living in the home. Assistants in a group family home, before hire. The Licensee’s Manual requires a vulnerable sector check as part of the search. The result must be no more than 6 months old when the centre accepts it at hire. Under-18s who cannot submit a search must always be supervised with children.",
    whatFr:
      "Centres : chaque employé, avant l’embauche. Milieux familiaux : le responsable et chaque adulte (18 ans ou plus) qui habite le domicile. Les assistants d’une garderie familiale de groupe, avant l’embauche. Le manuel du titulaire exige une vérification du secteur vulnérable dans la recherche. Le résultat doit dater de 6 mois ou moins quand le centre l’accepte à l’embauche. Une personne de moins de 18 ans qui ne peut pas fournir la recherche doit toujours être supervisée avec les enfants.",
    whenEn:
      "Before hire for centre employees and group-family assistants. Homes provide checks with the licence application. After hire, as often as the centre’s written policy says. The regulation itself sets no repeat interval. Tell the centre about new charges. Homes tell the ministry within 24 hours of a change to an adult resident’s record.",
    whenFr:
      "Avant l’embauche pour les employés du centre et les assistants en garderie familiale de groupe. Les milieux familiaux fournissent les vérifications avec la demande de permis. Après l’embauche, selon la politique écrite du service de garde. Le règlement lui-même ne fixe pas d’intervalle. Avisez le centre de toute nouvelle accusation. Les milieux familiaux avisent le ministère dans les 24 heures d’un changement au dossier d’un résident adulte.",
    whereEn: "Local police or the RCMP where the person lives. Take a letter from the centre that the job is a position of trust with children.",
    whereFr: "La police locale ou la GRC où la personne habite. Apportez une lettre du centre indiquant que le poste est un poste de confiance auprès des enfants.",
    links: [rcmpLink],
    documentsEn: "Government ID, the centre’s letter, and payment if police require it. The official result is not a photocopy.",
    documentsFr: "Une pièce d’identité, la lettre du centre, et le paiement si la police l’exige. Le résultat officiel n’est pas une photocopie.",
    ...police,
    renewal: { mode: "centre_policy" },
    renewalEn:
      "No statutory re-check interval. The centre’s written policy must set how often checks are repeated, who pays, and the duty to report new charges. A search is acceptable at hire if it was done within the past 6 months.",
    renewalFr:
      "Aucun intervalle de revérification dans le règlement. La politique écrite du centre doit dire à quelle fréquence les vérifications sont refaites, qui paie, et le devoir de signaler de nouvelles accusations. Une recherche est acceptable à l’embauche si elle a été faite dans les 6 derniers mois.",
    keeperEn:
      "The centre must keep the results of the criminal record check in the employee record. The manual says photocopies are not valid. The official result stays in a locked personnel file at the centre. A scan in KidEase is not the legal file.",
    keeperFr:
      "Le centre doit garder les résultats de la recherche de casier dans le dossier de l’employé. Le manuel dit que les photocopies ne sont pas valides. Le résultat officiel reste dans un dossier du personnel verrouillé au centre. Un scan dans KidEase n’est pas le dossier légal.",
    unconfirmed: false,
    sources: [
      { label: "The Child Care Regulations, 2015 (Saskatchewan), ss. 45, 47, and 63", asOf: READ },
      { label: "Saskatchewan Licensee’s Manual, s. 45, 1 August 2025", asOf: "2025-08-01" },
      rcmpSource,
    ],
  };
  return {
    code: "SK",
    summaryEn:
      "Saskatchewan requires a criminal record check before hire. It does not set how often to repeat it. The centre’s written policy does. Photocopies are not the legal file.",
    summaryFr:
      "La Saskatchewan exige une recherche de casier avant l’embauche. Elle ne dit pas à quelle fréquence la refaire. C’est la politique écrite du centre. Les photocopies ne sont pas le dossier légal.",
    checks: [crc],
    roleNotes: {
      volunteer_student: {
        en: "Volunteers: screening is recommended in the Licensee’s Manual. It is not a hard duty under s. 45. Follow the centre’s written policy.",
        fr: "Bénévoles : le manuel du titulaire recommande la vérification. Ce n’est pas une obligation stricte de l’article 45. Suivez la politique écrite du centre.",
      },
    },
  };
}

function manitoba(): BgJurisdiction {
  const police = localCost();
  const crc: GuideCheck = {
    id: "mb_crc_vsc",
    kind: "crc_vsc",
    roles: ["centre_staff", "volunteer_student", "home_provider", "home_resident", "operator"],
    titleEn: "Criminal record check with a vulnerable sector search",
    titleFr: "Relevé des antécédents judiciaires, y compris une recherche relative au secteur vulnérable",
    whatEn:
      "For centres, a criminal record check is defined as including a vulnerable sector search. It is for every employment applicant who may be present when children attend, and every nursery-school volunteer. For homes, official guidance asks for this check for applicants and residents who are 18 or older.",
    whatFr:
      "Pour les centres, un relevé des antécédents judiciaires comprend une recherche relative au secteur vulnérable. Il vise chaque candidat à l’emploi qui peut être présent quand les enfants sont là, et chaque bénévole de prématernelle. Pour les milieux familiaux, les directives officielles demandent cette vérification pour les demandeurs et les résidents de 18 ans ou plus.",
    whenEn:
      "The check must be dated within 3 months of the job application or of becoming a nursery-school volunteer. Provide it as part of hiring or volunteer approval. Existing staff do not have a set “every X years” rule. At licence renewal, new checks are needed only if the information has changed, or if the provincial director asks.",
    whenFr:
      "La vérification doit dater de 3 mois ou moins avant la demande d’emploi ou avant de devenir bénévole en prématernelle. Fournissez-la à l’embauche ou à l’approbation du bénévolat. Le personnel déjà en poste n’a pas de règle « tous les X ans ». Au renouvellement du permis, de nouvelles vérifications sont exigées seulement si l’information a changé, ou si le directeur provincial le demande.",
    whereEn:
      "Local police or the RCMP at the person’s address. Homes then submit the check to the Early Learning and Child Care Program, 210-114 Garry Street, Winnipeg (cdcinfo@gov.mb.ca, 1-888-213-4754).",
    whereFr:
      "La police locale ou la GRC à l’adresse de la personne. Les milieux familiaux envoient ensuite la vérification au programme d’apprentissage et de garde des jeunes enfants, 210-114, rue Garry, Winnipeg (cdcinfo@gov.mb.ca, 1-888-213-4754).",
    links: [
      rcmpLink,
      {
        labelEn: "Home-based background checks",
        labelFr: "Vérifications pour la garde en milieu familial",
        href: "https://www.manitoba.ca/education/childcare/centres_homeproviders/homebased_childcare/background.html",
      },
    ],
    documentsEn: "The police result, plus the province’s criminal-history disclosure and consent forms for centre hiring.",
    documentsFr: "Le résultat policier, plus les formulaires provinciaux de divulgation des antécédents et de consentement pour l’embauche en centre.",
    ...police,
    renewal: { mode: "centre_policy" },
    renewalEn:
      "No fixed renewal cycle for existing centre staff in M.R. 62/86. The centre resubmits checks at licence renewal only if the documents have changed, or if the provincial director asks. A centre that wants a repeat schedule sets it in its own policy.",
    renewalFr:
      "Aucun cycle de renouvellement fixe pour le personnel déjà en poste dans le R.M. 62/86. Le centre renvoie les vérifications au renouvellement du permis seulement si les documents ont changé, ou si le directeur provincial le demande. Un centre qui veut un calendrier de reprise le met dans sa propre politique.",
    keeperEn:
      "The licence holder examines the documents and, if they are clear, completes the provincial verification form. Keep the official results in the centre file. KidEase records that the result was seen. It does not replace that file.",
    keeperFr:
      "Le titulaire de permis examine les documents et, s’ils sont clairs, remplit le formulaire provincial de vérification. Gardez les résultats officiels dans le dossier du centre. KidEase note que le résultat a été vu. Cela ne remplace pas ce dossier.",
    unconfirmed: false,
    sources: [
      { label: "Manitoba M.R. 62/86, current as of 18 November 2026, ss. 5, 5.1, and 7(12)", asOf: "2026-11-18" },
      {
        label: "Manitoba ELCC home background-checks page",
        href: "https://www.manitoba.ca/education/childcare/centres_homeproviders/homebased_childcare/background.html",
        asOf: READ,
      },
      rcmpSource,
    ],
  };
  const car: GuideCheck = {
    id: "mb_car",
    kind: "child_abuse_registry",
    roles: ["centre_staff", "volunteer_student", "home_provider", "home_resident", "operator"],
    titleEn: "Manitoba Child Abuse Registry check",
    titleFr: "Vérification au registre des mauvais traitements infligés aux enfants",
    whatEn:
      "Centres: a child abuse registry check for every employment applicant who may be present when children attend, and every nursery-school volunteer. Homes: Child Abuse Registry and Prior Contact checks for applicants and residents who are 12 or older. Home forms come from the Early Learning and Child Care Program. Do not use the public self-check forms on the Child Protection website for a home licence.",
    whatFr:
      "Centres : une vérification au registre des mauvais traitements pour chaque candidat à l’emploi qui peut être présent quand les enfants sont là, et chaque bénévole de prématernelle. Milieux familiaux : registre des mauvais traitements et vérification des contacts antérieurs pour les demandeurs et les résidents de 12 ans ou plus. Les formulaires du milieu familial viennent du programme d’apprentissage et de garde. N’utilisez pas les formulaires publics d’autovérification du site de la protection de l’enfance pour un permis en milieu familial.",
    whenEn:
      "Dated within 3 months of the job application or of becoming a nursery-school volunteer. Existing staff have no fixed “every X years” rule in the regulation.",
    whenFr:
      "Datée de 3 mois ou moins avant la demande d’emploi ou avant de devenir bénévole en prématernelle. Le personnel déjà en poste n’a pas de règle « tous les X ans » dans le règlement.",
    whereEn:
      "Apply online, by mail, or in person at 777 Portage Avenue, Winnipeg. Two valid government IDs are required, one with name, date of birth, signature, photo, and expiry date. If mailing home-licence forms, ID must be witnessed as the ELCC page describes.",
    whereFr:
      "Demande en ligne, par la poste, ou en personne au 777, avenue Portage, Winnipeg. Deux pièces d’identité gouvernementales valides, dont une avec le nom, la date de naissance, la signature, la photo et la date d’expiration. Si vous postez les formulaires d’un permis en milieu familial, l’identité doit être attestée comme la page du programme le décrit.",
    links: [
      {
        labelEn: "Child Abuse Registry",
        labelFr: "Registre des mauvais traitements",
        href: "https://www.manitoba.ca/fs/childfam/child_abuse_registry.html",
      },
      {
        labelEn: "Online application",
        labelFr: "Demande en ligne",
        href: "https://web.gov.mb.ca/AbuseRegistry/AbuseRegistryApplication",
      },
    ],
    documentsEn: "Two valid government IDs, as the registry page describes. Home applicants use ELCC forms, not the public self-check forms.",
    documentsFr: "Deux pièces d’identité gouvernementales valides, comme la page du registre le décrit. Les demandeurs en milieu familial utilisent les formulaires du programme, pas les formulaires publics d’autovérification.",
    costPublished: true,
    costEn:
      "Published registry fees: $20 for the first application, and $5 for each additional one requested at the same time. Volunteers, student trainees, and work placements may be fee-exempt if they apply through the organization’s process. Confirm on the official page. Police check fees are separate and local.",
    costFr:
      "Frais publiés du registre : 20 $ pour la première demande, et 5 $ pour chaque demande supplémentaire faite en même temps. Les bénévoles, les stagiaires et les stages de travail peuvent être exemptés s’ils passent par le processus de l’organisation. Confirmez sur la page officielle. Les frais de la vérification policière sont distincts et locaux.",
    renewal: { mode: "centre_policy" },
    renewalEn:
      "No fixed renewal cycle for existing staff. At licence renewal, a new check is required only if the information has changed, or if the provincial director asks.",
    renewalFr:
      "Aucun cycle de renouvellement fixe pour le personnel déjà en poste. Au renouvellement du permis, une nouvelle vérification est exigée seulement si l’information a changé, ou si le directeur provincial le demande.",
    keeperEn: "The licence holder examines the result and keeps it in the centre file.",
    keeperFr: "Le titulaire de permis examine le résultat et le garde dans le dossier du centre.",
    unconfirmed: false,
    sources: [
      { label: "Manitoba M.R. 62/86, current as of 18 November 2026", asOf: "2026-11-18" },
      {
        label: "Manitoba Child Abuse Registry page. On 20 November 2026 the ministry was processing applications received 31 October 2026.",
        href: "https://www.manitoba.ca/fs/childfam/child_abuse_registry.html",
        asOf: "2026-11-20",
      },
    ],
  };
  const prior: GuideCheck = {
    id: "mb_prior",
    kind: "prior_contact",
    roles: ["home_provider", "home_resident"],
    titleEn: "Prior Contact Check (homes, age 12+)",
    titleFr: "Vérification des contacts antérieurs (milieu familial, 12 ans ou plus)",
    whatEn:
      "Homes: a Prior Contact Check for applicants and residents who are 12 or older, using forms from the Early Learning and Child Care Program. Do not use the public self-check forms.",
    whatFr:
      "Milieux familiaux : une vérification des contacts antérieurs pour les demandeurs et les résidents de 12 ans ou plus, avec les formulaires du programme d’apprentissage et de garde. N’utilisez pas les formulaires publics d’autovérification.",
    whenEn: "With the home background-check package. No separate “every X years” interval is stated for existing centre staff, and this check is the home path.",
    whenFr: "Avec le dossier de vérifications du milieu familial. Aucun intervalle « tous les X ans » distinct n’est indiqué, et cette vérification vise le milieu familial.",
    whereEn: "Get the form from the Early Learning and Child Care Program and send it as that page describes.",
    whereFr: "Obtenez le formulaire auprès du programme d’apprentissage et de garde et envoyez-le comme la page le décrit.",
    links: [
      {
        labelEn: "Home-based background checks",
        labelFr: "Vérifications pour la garde en milieu familial",
        href: "https://www.manitoba.ca/education/childcare/centres_homeproviders/homebased_childcare/background.html",
      },
    ],
    documentsEn: "The ELCC Prior Contact form. If mailing, follow the witnessed-ID steps on the ELCC page.",
    documentsFr: "Le formulaire de contacts antérieurs du programme. Par la poste, suivez les étapes d’attestation de l’identité sur la page du programme.",
    costPublished: false,
    costEn: "No separate Prior Contact fee is published on the pages read for this guide. Confirm with the ELCC Program.",
    costFr: "Aucun frais distinct pour les contacts antérieurs n’est publié sur les pages lues pour ce guide. Confirmez auprès du programme.",
    renewal: { mode: "centre_policy" },
    renewalEn: "No fixed renewal cycle is stated. Follow the ELCC Program and the centre’s own policy.",
    renewalFr: "Aucun cycle de renouvellement fixe n’est indiqué. Suivez le programme et la politique du centre.",
    keeperEn: "The Early Learning and Child Care Program and the licensee keep what the home process requires.",
    keeperFr: "Le programme d’apprentissage et de garde et le titulaire gardent ce que le processus du milieu familial exige.",
    unconfirmed: false,
    sources: [
      {
        label: "Manitoba ELCC home background-checks page",
        href: "https://www.manitoba.ca/education/childcare/centres_homeproviders/homebased_childcare/background.html",
        asOf: READ,
      },
    ],
  };
  return {
    code: "MB",
    summaryEn:
      "Manitoba centres need a criminal record check with a vulnerable sector search, a Child Abuse Registry check, a criminal-history disclosure, and a consent. There is no fixed renewal cycle for existing staff.",
    summaryFr:
      "Les centres du Manitoba ont besoin d’un relevé des antécédents avec recherche relative au secteur vulnérable, d’une vérification au registre des mauvais traitements, d’une divulgation des antécédents et d’un consentement. Il n’y a pas de cycle de renouvellement fixe pour le personnel déjà en poste.",
    checks: [crc, car, prior],
    roleNotes: {},
  };
}

function ontario(): BgJurisdiction {
  const police = localCost();
  const vsc: GuideCheck = {
    id: "on_vsc",
    kind: "vsc",
    roles: ALL_ROLES,
    titleEn: "Vulnerable sector check",
    titleFr: "Vérification auprès du secteur vulnérable (VSV)",
    whatEn:
      "Centres: every employee, and every volunteer or student who will interact with children. Home child care: the provider, every person 18 or older who lives in the home or is regularly there, home visitors and agency staff who may interact with children, and volunteers and students. Nobody under 18 needs a vulnerable sector check. There is no general employer-accessible child abuse registry in these rules.",
    whatFr:
      "Centres : chaque employé, et chaque bénévole ou étudiant qui interagira avec les enfants. Garde en milieu familial : le responsable, chaque personne de 18 ans ou plus qui habite le domicile ou s’y trouve régulièrement, les visiteurs à domicile et le personnel de l’agence qui peuvent interagir avec les enfants, ainsi que les bénévoles et les étudiants. Personne de moins de 18 ans n’a besoin d’une vérification auprès du secteur vulnérable. Ces règles ne prévoient pas de registre public d’abus accessible à l’employeur.",
    whenEn:
      "Employees: before work starts. A person may start before the check arrives only if they apply promptly, the wait justifies it, and extra measures such as constant supervision are in the written policy. Volunteers and students: before they interact with children. The check must be no more than 6 months old when the centre receives it. A new check is due on or before the fifth anniversary. After a break of 6 months or more, a new check is needed before return. Volunteers or students may use a check older than 6 months but less than 5 years only if they also give an offence declaration for the gap. A check older than 5 years cannot be used.",
    whenFr:
      "Employés : avant le début du travail. Une personne peut commencer avant l’arrivée de la vérification seulement si elle fait la demande rapidement, si l’attente le justifie, et si des mesures supplémentaires, comme une supervision constante, sont dans la politique écrite. Bénévoles et étudiants : avant d’interagir avec les enfants. La vérification doit dater de 6 mois ou moins quand le centre la reçoit. Une nouvelle vérification est due au plus tard au cinquième anniversaire. Après une pause de 6 mois ou plus, une nouvelle vérification est exigée avant le retour. Un bénévole ou un étudiant peut utiliser une vérification de plus de 6 mois mais de moins de 5 ans seulement avec une déclaration d’infraction pour la période manquante. Une vérification de plus de 5 ans ne peut pas servir.",
    whereEn:
      "The police service that serves the person’s home address (municipal police, Ontario Provincial Police in some areas, or the RCMP in a few communities). The centre should provide a letter naming the position and that it is a position of trust with children.",
    whereFr:
      "Le service de police de l’adresse domiciliaire (police municipale, Police provinciale de l’Ontario dans certaines régions, ou GRC dans quelques communautés). Le centre devrait fournir une lettre qui nomme le poste et précise qu’il s’agit d’un poste de confiance auprès des enfants.",
    links: [
      rcmpLink,
      {
        labelEn: "Ontario: police record checks",
        labelFr: "Ontario : vérifications de dossiers de police",
        href: "https://www.ontario.ca/page/police-record-checks",
      },
    ],
    documentsEn: "Government ID, the centre’s letter, and payment. Fingerprints only if the police ask.",
    documentsFr: "Une pièce d’identité, la lettre du centre, et le paiement. Empreintes seulement si la police les demande.",
    ...police,
    renewal: { mode: "years", years: 5 },
    renewalEn:
      "A new vulnerable sector check is due on or before the fifth anniversary. In each year without a new check, an offence declaration is due. See that card.",
    renewalFr:
      "Une nouvelle vérification auprès du secteur vulnérable est due au plus tard au cinquième anniversaire. Chaque année sans nouvelle vérification, une déclaration d’infraction est due. Voyez cette fiche.",
    keeperEn:
      "The licensee keeps the original or a true copy in the personnel file, securely. A true copy is a photocopy or digital copy signed and dated by the person who reviewed it, confirming it matches the original. It may be paper or electronic. That duty belongs to the licensee, not to KidEase.",
    keeperFr:
      "Le titulaire garde l’original ou une copie conforme dans le dossier du personnel, de façon sécuritaire. Une copie conforme est une photocopie ou une copie numérique signée et datée par la personne qui l’a examinée, confirmant qu’elle correspond à l’original. Elle peut être sur papier ou électronique. Ce devoir appartient au titulaire, pas à KidEase.",
    unconfirmed: false,
    sources: [
      {
        label: "O. Reg. 137/15, as explained in the Child Care Centre Licensing Manual, Part 9, updated 7 February 2025",
        href: "https://www.ontario.ca/page/police-record-checks",
        asOf: "2025-02-07",
      },
      rcmpSource,
    ],
  };
  const declaration: GuideCheck = {
    id: "on_offence_declaration",
    kind: "offence_declaration",
    roles: ALL_ROLES,
    titleEn: "Offence declaration",
    titleFr: "Déclaration d’infraction",
    whatEn:
      "In each year without a new vulnerable sector check, a signed offence declaration lists any Criminal Code convictions. After any new conviction, a new declaration is due as soon as reasonably possible.",
    whatFr:
      "Chaque année sans nouvelle vérification auprès du secteur vulnérable, une déclaration d’infraction signée énumère les condamnations au Code criminel. Après une nouvelle condamnation, une nouvelle déclaration est due dès que possible.",
    whenEn:
      "No later than 15 days after the anniversary of the most recent vulnerable sector check or declaration.",
    whenFr:
      "Au plus tard 15 jours après l’anniversaire de la dernière vérification auprès du secteur vulnérable ou de la dernière déclaration.",
    whereEn: "Offence declaration forms are on the Ontario Central Forms Repository. The person signs and gives the form to the licensee.",
    whereFr: "Les formulaires de déclaration d’infraction sont dans le Répertoire central des formulaires de l’Ontario. La personne signe et remet le formulaire au titulaire.",
    links: [
      {
        labelEn: "Ontario: police record checks",
        labelFr: "Ontario : vérifications de dossiers de police",
        href: "https://www.ontario.ca/page/police-record-checks",
      },
    ],
    documentsEn: "The signed offence declaration form.",
    documentsFr: "Le formulaire de déclaration d’infraction signé.",
    costPublished: false,
    costEn: "No fee is published for the offence declaration. It is a form, not a police check.",
    costFr: "Aucun frais n’est publié pour la déclaration d’infraction. C’est un formulaire, pas une vérification policière.",
    renewal: { mode: "declaration", withinDays: 15 },
    renewalEn: "Every year a new vulnerable sector check is not obtained, no later than 15 days after the anniversary.",
    renewalFr: "Chaque année sans nouvelle vérification auprès du secteur vulnérable, au plus tard 15 jours après l’anniversaire.",
    keeperEn: "The licensee keeps the declaration in the personnel file.",
    keeperFr: "Le titulaire garde la déclaration dans le dossier du personnel.",
    unconfirmed: false,
    sources: [
      {
        label: "Ontario Child Care Centre Licensing Manual, Part 9, updated 7 February 2025",
        asOf: "2025-02-07",
      },
    ],
  };
  return {
    code: "ON",
    summaryEn:
      "Ontario uses a police vulnerable sector check, then a yearly offence declaration in the years between new checks. The licensee keeps the original or a true copy.",
    summaryFr:
      "L’Ontario utilise une vérification auprès du secteur vulnérable, puis une déclaration d’infraction chaque année entre les nouvelles vérifications. Le titulaire garde l’original ou une copie conforme.",
    checks: [vsc, declaration],
    roleNotes: {},
  };
}

function quebec(): BgJurisdiction {
  const vae: GuideCheck = {
    id: "qc_vae",
    kind: "vae",
    roles: ALL_ROLES,
    titleEn: "Vérification d’absence d’empêchement (VAE)",
    titleFr: "Vérification d’absence d’empêchement (VAE)",
    whatEn:
      "This is a vérification d’absence d’empêchement, not a standard vulnerable sector check. If the search is clear, police issue an attestation d’absence d’empêchement (AAE). If not, they issue a declaration of potential impediment, and the licence holder, coordinating office, or minister decides. It is required for the licence holder if an individual, administrators, shareholders, people who work in the facility during care, regular adult students and volunteers, people who regularly transport children, and replacement-agency staff. In home care: the recognized provider, applicants, adults living in the home, assistants, occasional replacements, and regular adult volunteers and students. Minors are not in the standard VAE process. Other conditions apply.",
    whatFr:
      "Il s’agit d’une vérification d’absence d’empêchement, pas d’une vérification du secteur vulnérable. Si la recherche est claire, la police délivre une attestation d’absence d’empêchement (AAE). Sinon, elle délivre une déclaration d’empêchement potentiel, et le titulaire de permis, le bureau coordonnateur ou le ministre décide. Elle est exigée pour le titulaire de permis s’il s’agit d’une personne, les administrateurs, les actionnaires, les personnes qui travaillent dans l’installation pendant la prestation, les étudiants et bénévoles adultes réguliers, les personnes qui transportent régulièrement des enfants, et le personnel d’une agence de remplacement. En milieu familial : le responsable d’un service de garde éducatif en milieu familial (RSGE), les demandeurs, les adultes qui habitent le domicile, les assistants, les remplaçants occasionnels, et les bénévoles et étudiants adultes réguliers. Les mineurs ne sont pas dans le processus VAE habituel. D’autres conditions s’appliquent.",
    whenEn:
      "Before the person holds the role. An AAE is generally valid 3 years and is generally valid for only one purpose and one employer. Renew generally every 3 years, and usually when the person’s situation changes, for example a new employer.",
    whenFr:
      "Avant que la personne occupe le rôle. Une AAE est généralement valide 3 ans et généralement valide pour un seul objet et un seul employeur. Renouvellement en général tous les 3 ans, et habituellement quand la situation change, par exemple un nouvel employeur.",
    whereEn:
      "The centre or bureau coordonnateur must have a protocol with the police service of its territory, then submit each person’s request. The person signs the consent. This is not a mail-in vendor check and not a SOQUIJ court search. Centres outside Montréal ask their local police and the ministry guide.",
    whereFr:
      "Le centre ou le bureau coordonnateur de la garde éducative en milieu familial doit avoir un protocole avec le service de police de son territoire, puis soumettre la demande de chaque personne. La personne signe le consentement. Ce n’est pas une vérification par un fournisseur postal ni une recherche à la SOQUIJ. Hors de Montréal, demandez à la police locale et au guide du ministère.",
    links: [
      {
        labelEn: "Vérification d’absence d’empêchement en service de garde",
        labelFr: "Vérification d’absence d’empêchement en service de garde",
        href: "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reseau/responsabilites/sante-securite/verification-absence-empechement",
      },
      {
        labelEn: "SPVM: protocoles d’entente (Montréal example)",
        labelFr: "SPVM : protocoles d’entente (exemple de Montréal)",
        href: "https://spvm.qc.ca/fr/Fiches/Details/Verifications--Protocoles-dentente",
      },
    ],
    documentsEn: "The police and ministry forms the centre gives you. Do not apply as if this were an Ontario-style self-serve vulnerable sector check.",
    documentsFr: "Les formulaires de la police et du ministère que le centre vous remet. Ne faites pas la demande comme s’il s’agissait d’une vérification du secteur vulnérable en libre-service.",
    costPublished: false,
    costEn: "Set by the police service under the protocol. Not a single provincial fee. Confirm with the centre.",
    costFr: "Fixés par le service de police selon le protocole. Pas un tarif provincial unique. Confirmez avec le centre.",
    renewal: { mode: "years", years: 3 },
    renewalEn: "Generally every 3 years, and usually when the person’s situation changes.",
    renewalFr: "En général tous les 3 ans, et habituellement quand la situation de la personne change.",
    keeperEn:
      "The attestation, or the decision after a potential-impediment review, is the document the centre must hold. KidEase uses the names VAE and AAE. It does not call this a vulnerable sector check.",
    keeperFr:
      "L’attestation, ou la décision après une déclaration d’empêchement potentiel, est le document que le centre doit conserver. KidEase utilise les noms VAE et AAE. Ce n’est pas une vérification du secteur vulnérable.",
    unconfirmed: false,
    sources: [
      {
        label: "Quebec.ca, Vérification d’absence d’empêchement en service de garde",
        href: "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/reseau/responsabilites/sante-securite/verification-absence-empechement",
        asOf: READ,
      },
      {
        label: "SPVM, Protocoles d’entente",
        href: "https://spvm.qc.ca/fr/Fiches/Details/Verifications--Protocoles-dentente",
        asOf: READ,
      },
    ],
  };
  return {
    code: "QC",
    summaryEn:
      "Quebec uses a vérification d’absence d’empêchement arranged by the centre or coordinating office with local police. It is not a vulnerable sector check you order yourself.",
    summaryFr:
      "Le Québec utilise une vérification d’absence d’empêchement organisée par le centre ou le bureau coordonnateur avec la police locale. Ce n’est pas une vérification du secteur vulnérable que la personne commande seule.",
    checks: [vae],
    roleNotes: {},
  };
}

function newBrunswick(): BgJurisdiction {
  const police = localCost();
  const crc: GuideCheck = {
    id: "nb_crc",
    kind: "crc_vsc",
    roles: ["centre_staff", "volunteer_student", "home_resident", "operator"],
    titleEn: "Criminal record check or vulnerable sector check",
    titleFr: "Vérification du casier judiciaire ou du secteur vulnérable, selon le cas",
    whatEn:
      "Before a person becomes a staff member: a criminal record check or a vulnerable sector check, as the case may be. The same checks, at least every 5 years, for staff, the operator, and associated persons (people 18 or older who live at the facility, excluding the operator). The operator manual says staff includes administrators and most volunteers. Students on practicum, and parents volunteering at the facility their own children attend, are not required to have these checks and must be supervised. Associated persons’ licence-application documents are a criminal record check. The application text does not require a vulnerable sector check for them.",
    whatFr:
      "Avant qu’une personne devienne membre du personnel : une vérification du casier judiciaire ou du secteur vulnérable, selon le cas. Les mêmes vérifications, au moins tous les 5 ans, pour le personnel, l’exploitant et les personnes associées (personnes de 18 ans ou plus qui habitent l’installation, sauf l’exploitant). Le manuel de l’exploitant dit que le personnel comprend les administrateurs et la plupart des bénévoles. Les étudiants en stage, et les parents qui font du bénévolat dans l’installation que fréquentent leurs propres enfants, n’ont pas à avoir ces vérifications et doivent être supervisés. Les documents de demande de permis des personnes associées sont une vérification du casier judiciaire. Le texte de la demande n’exige pas une vérification du secteur vulnérable pour elles.",
    whenEn: "Before becoming staff. Then at least every 5 years. Checks filed with an application must have been issued in the previous 3 months.",
    whenFr: "Avant de devenir membre du personnel. Puis au moins tous les 5 ans. Les vérifications jointes à une demande doivent avoir été délivrées dans les 3 mois précédents.",
    whereEn: "Local police or the RCMP.",
    whereFr: "La police locale ou la GRC.",
    links: [rcmpLink],
    documentsEn: "The police result issued in the previous 3 months when it is part of a licence application.",
    documentsFr: "Le résultat policier délivré dans les 3 mois précédents lorsqu’il fait partie d’une demande de permis.",
    ...police,
    renewal: { mode: "years", years: 5 },
    renewalEn: "At least every 5 years for staff, the operator, and associated persons.",
    renewalFr: "Au moins tous les 5 ans pour le personnel, l’exploitant et les personnes associées.",
    keeperEn: "The operator keeps a copy of both this check and the Social Development check at the licensed facility.",
    keeperFr: "L’exploitant garde une copie de cette vérification et de la vérification du Développement social à l’installation permise.",
    unconfirmed: false,
    sources: [
      { label: "New Brunswick Licensing Regulation 2018-11, s. 12, and the operator manual", asOf: READ },
      rcmpSource,
    ],
  };
  const sd: GuideCheck = {
    id: "nb_sd",
    kind: "social_development",
    roles: ["centre_staff", "volunteer_student", "home_resident", "operator"],
    titleEn: "Department of Social Development record check",
    titleFr: "Vérification auprès du ministère du Développement social",
    whatEn:
      "A check with the Department of Social Development for child-protection findings. It is not a child abuse registry check from another province. The same people as the police check, with the same practicum and parent-volunteer exception in the operator manual.",
    whatFr:
      "Une vérification auprès du ministère du Développement social pour les constats de protection de l’enfance. Ce n’est pas un registre des mauvais traitements d’une autre province. Les mêmes personnes que pour la vérification policière, avec la même exception pour les stagiaires et les parents bénévoles dans le manuel de l’exploitant.",
    whenEn: "Before becoming staff, then at least every 5 years. Application checks must have been issued in the previous 3 months. Results are generally returned in about two weeks.",
    whenFr: "Avant de devenir membre du personnel, puis au moins tous les 5 ans. Les vérifications de demande doivent avoir été délivrées dans les 3 mois précédents. Les résultats reviennent en général en environ deux semaines.",
    whereEn:
      "Ask the regional Early Learning and Childcare office for the official consent form. The office forwards it to Social Development. There is no separate Social Development fee listed on those forms. Licence application fees are separate.",
    whereFr:
      "Demandez le formulaire de consentement officiel au bureau régional des services d’apprentissage et de garde. Le bureau le transmet au Développement social. Aucun frais distinct n’est indiqué sur ces formulaires. Les frais de demande de permis sont distincts.",
    links: [
      {
        labelEn: "Early Learning and Childcare Services",
        labelFr: "Services d’apprentissage et de garde",
        href: "https://www2.gnb.ca/content/gnb/en/departments/education/elcc.html",
      },
    ],
    documentsEn: "The official consent form from the regional office.",
    documentsFr: "Le formulaire de consentement officiel du bureau régional.",
    costPublished: false,
    costEn: "No separate Social Development check fee is listed on the application forms read for this guide. Confirm with the regional office.",
    costFr: "Aucun frais distinct pour la vérification du Développement social n’est indiqué sur les formulaires lus pour ce guide. Confirmez auprès du bureau régional.",
    renewal: { mode: "years", years: 5 },
    renewalEn: "At least every 5 years, with the police check.",
    renewalFr: "Au moins tous les 5 ans, avec la vérification policière.",
    keeperEn: "Keep a copy in the staff or associated-person record at the licensed facility.",
    keeperFr: "Gardez une copie dans le dossier du personnel ou de la personne associée, à l’installation permise.",
    unconfirmed: false,
    sources: [
      { label: "New Brunswick Licensing Regulation 2018-11 and department application guidance", asOf: READ },
      {
        label: "Early Learning and Childcare Services",
        href: "https://www2.gnb.ca/content/gnb/en/departments/education/elcc.html",
        asOf: READ,
      },
    ],
  };
  return {
    code: "NB",
    summaryEn:
      "New Brunswick requires a criminal record check or vulnerable sector check, as the role requires, and a Social Development check. Both are repeated at least every 5 years.",
    summaryFr:
      "Le Nouveau-Brunswick exige une vérification du casier judiciaire ou du secteur vulnérable, selon le rôle, et une vérification du Développement social. Les deux sont refaites au moins tous les 5 ans.",
    checks: [crc, sd],
    roleNotes: {
      home_provider: {
        en: "A home facility follows the same staff, operator, and associated-person rules. Associated persons are adults 18 or older who live at the facility, other than the operator.",
        fr: "Un service en milieu familial suit les mêmes règles pour le personnel, l’exploitant et les personnes associées. Les personnes associées sont les adultes de 18 ans ou plus qui habitent l’installation, sauf l’exploitant.",
      },
    },
  };
}

function novaScotia(): BgJurisdiction {
  const vsc: GuideCheck = {
    id: "ns_vsc",
    kind: "vsc",
    roles: ALL_ROLES,
    titleEn: "Vulnerable sector check (age 18+)",
    titleFr: "Vérification du secteur vulnérable (18 ans ou plus)",
    whatEn:
      "A vulnerable sector check for everyone 18 or older who has or will have contact with children in a licensed program or approved family-home program, including volunteers, or who lives in a home that is a licensed facility or family child-care home. If a vulnerable sector check is refused under the Criminal Records Act, the person gives proof of the refusal and a criminal record check instead.",
    whatFr:
      "Une vérification du secteur vulnérable pour chaque personne de 18 ans ou plus qui a ou aura un contact avec les enfants dans un programme permis ou un programme familial approuvé, y compris les bénévoles, ou qui habite un domicile qui est une installation permise ou une garderie en milieu familial. Si une vérification du secteur vulnérable est refusée en vertu de la Loi sur le casier judiciaire, la personne fournit la preuve du refus et une vérification du casier judiciaire à la place.",
    whenEn:
      "New employees provide required checks before work starts. The checks must have been done less than 2 years before that date. No contact with children until the licensee has all results and is satisfied. Then a new vulnerable sector check at least every 5 years.",
    whenFr:
      "Les nouveaux employés fournissent les vérifications exigées avant le début du travail. Elles doivent dater de moins de 2 ans avant cette date. Aucun contact avec les enfants tant que le titulaire n’a pas tous les résultats et n’est pas satisfait. Puis une nouvelle vérification du secteur vulnérable au moins tous les 5 ans.",
    whereEn: "Local police or the RCMP. Bring a letter from the centre.",
    whereFr: "La police locale ou la GRC. Apportez une lettre du centre.",
    links: [rcmpLink],
    documentsEn: "Government ID, the centre’s letter, and payment if police require it.",
    documentsFr: "Une pièce d’identité, la lettre du centre, et le paiement si la police l’exige.",
    ...localCost(),
    renewal: { mode: "years", years: 5 },
    renewalEn: "At least every 5 years. A check used at hire must be less than 2 years old.",
    renewalFr: "Au moins tous les 5 ans. Une vérification utilisée à l’embauche doit dater de moins de 2 ans.",
    keeperEn: "The licensee keeps the results and decides whether they raise a concern.",
    keeperFr: "Le titulaire garde les résultats et décide s’ils soulèvent une préoccupation.",
    unconfirmed: false,
    sources: [
      {
        label: "Nova Scotia Early Learning and Child Care Regulations, s. 43 (unofficial consolidation amended to N.S. Reg. 165/2020)",
        href: "https://novascotia.ca/just/regulations/regs/elcc.htm",
        asOf: READ,
      },
      rcmpSource,
    ],
  };
  const car: GuideCheck = {
    id: "ns_car",
    kind: "child_abuse_registry",
    roles: ALL_ROLES,
    titleEn: "Child Abuse Register search (age 13+)",
    titleFr: "Recherche au registre des personnes ayant commis des mauvais traitements (13 ans ou plus)",
    whatEn:
      "A child abuse register check for everyone 13 or older in the same situations as the vulnerable sector check: contact with children in a licensed or approved family-home program, including volunteers, or living in a home that is a licensed facility or family child-care home.",
    whatFr:
      "Une vérification au registre des mauvais traitements pour chaque personne de 13 ans ou plus dans les mêmes situations que la vérification du secteur vulnérable : contact avec les enfants dans un programme permis ou familial approuvé, y compris les bénévoles, ou résidence dans un domicile qui est une installation permise ou une garderie familiale.",
    whenEn:
      "New staff: before the first day, and the check must be less than 2 years old. Then at least every 3 years. No contact with children until the licensee has the result and is satisfied.",
    whenFr:
      "Nouveau personnel : avant le premier jour, et la vérification doit dater de moins de 2 ans. Puis au moins tous les 3 ans. Aucun contact avec les enfants tant que le titulaire n’a pas le résultat et n’est pas satisfait.",
    whereEn:
      "You apply for your own name on the official online form. You need government-issued ID. If the name is not on the register, you get a confirmation email the employer can verify online with your submission number and date of birth. The confirmation is current only as of the search date and is available online for 90 days.",
    whereFr:
      "Vous faites la demande pour votre propre nom sur le formulaire officiel en ligne. Une pièce d’identité gouvernementale est exigée. Si le nom n’est pas au registre, vous recevez un courriel de confirmation que l’employeur peut vérifier en ligne avec votre numéro de soumission et votre date de naissance. La confirmation vaut seulement à la date de la recherche et reste en ligne 90 jours.",
    links: [
      {
        labelEn: "Apply for a Child Abuse Register search",
        labelFr: "Demander une recherche au registre",
        href: "https://www.novascotia.ca/apply-child-abuse-register-search",
      },
    ],
    documentsEn: "Government-issued ID. After 90 days the online confirmation is no longer available, so the centre should already have saved what it needs.",
    documentsFr: "Une pièce d’identité gouvernementale. Après 90 jours, la confirmation en ligne n’est plus disponible. Le centre devrait déjà avoir conservé ce qu’il lui faut.",
    costPublished: true,
    costEn: "Published fee: no fee for the Child Abuse Register search. The vulnerable sector check has local police fees.",
    costFr: "Frais publiés : aucun frais pour la recherche au registre des mauvais traitements. La vérification du secteur vulnérable a des frais de police locaux.",
    renewal: { mode: "years", years: 3 },
    renewalEn: "At least every 3 years. Allow about 3 to 4 days, longer if information is missing.",
    renewalFr: "Au moins tous les 3 ans. Comptez environ 3 à 4 jours, plus longtemps s’il manque des renseignements.",
    keeperEn: "The licensee keeps the results. The online confirmation is only available for 90 days.",
    keeperFr: "Le titulaire garde les résultats. La confirmation en ligne n’est disponible que 90 jours.",
    unconfirmed: false,
    sources: [
      {
        label: "Nova Scotia Early Learning and Child Care Regulations, s. 43",
        href: "https://novascotia.ca/just/regulations/regs/elcc.htm",
        asOf: READ,
      },
      {
        label: "Apply for a Child Abuse Register search",
        href: "https://www.novascotia.ca/apply-child-abuse-register-search",
        asOf: READ,
      },
    ],
  };
  return {
    code: "NS",
    summaryEn:
      "Nova Scotia requires a vulnerable sector check for people 18 or older and a Child Abuse Register search for people 13 or older. The register search has no fee.",
    summaryFr:
      "La Nouvelle-Écosse exige une vérification du secteur vulnérable pour les personnes de 18 ans ou plus et une recherche au registre des mauvais traitements pour les personnes de 13 ans ou plus. La recherche au registre est sans frais.",
    checks: [vsc, car],
    roleNotes: {},
  };
}

function pei(): BgJurisdiction {
  const crc: GuideCheck = {
    id: "pe_crc_vsc",
    kind: "crc_vsc",
    roles: ALL_ROLES,
    titleEn: "Criminal record check and vulnerable sector search (CPIC)",
    titleFr: "Vérification du casier judiciaire et recherche du secteur vulnérable (CIPC)",
    whatEn:
      "Every staff member provides a criminal record check and a vulnerable sector search in the CPIC system. Volunteer records must include those results. Associated persons — residents of a home in which a centre is operated, staff, individual operators, partners, and corporate shareholders and directors — provide the same checks at licensing. Certificate holders follow the same freshness rules at certification.",
    whatFr:
      "Chaque membre du personnel fournit une vérification du casier judiciaire et une recherche du secteur vulnérable dans le système du Centre d’information de la police canadienne (CIPC). Le dossier des bénévoles doit comprendre ces résultats. Les personnes associées — résidents d’un domicile où un centre est exploité, personnel, exploitants individuels, associés, actionnaires et administrateurs — fournissent les mêmes vérifications au permis. Les titulaires de certificat suivent les mêmes règles de fraîcheur à la certification.",
    whenEn:
      "Staff: within 8 weeks of starting, with no unsupervised access until the checks and the first-aid rules are met. The check must not be earlier than 6 months before it is provided, then at least every 3 years. At licence renewal, a new statement is needed unless the Board already has one from the previous 3 years. A certificate renewal needs a new check if the last one is more than 3 years old.",
    whenFr:
      "Personnel : dans les 8 semaines suivant le début, sans accès non supervisé tant que les vérifications et les règles de secourisme ne sont pas satisfaites. La vérification ne doit pas dater de plus de 6 mois avant d’être fournie, puis au moins tous les 3 ans. Au renouvellement du permis, une nouvelle déclaration est exigée sauf si la Commission en a déjà une des 3 années précédentes. Le renouvellement d’un certificat exige une nouvelle vérification si la dernière a plus de 3 ans.",
    whereEn: "Police or the RCMP where the person lives. Take a letter from the centre.",
    whereFr: "La police ou la GRC où la personne habite. Apportez une lettre du centre.",
    links: [rcmpLink],
    documentsEn: "Government ID, the centre’s letter, and payment if police require it.",
    documentsFr: "Une pièce d’identité, la lettre du centre, et le paiement si la police l’exige.",
    ...localCost(),
    renewal: { mode: "years", years: 3 },
    renewalEn: "At least every 3 years. Records are kept at least one year after the person last provided services.",
    renewalFr: "Au moins tous les 3 ans. Les dossiers sont conservés au moins un an après la dernière prestation de services.",
    keeperEn: "The operator keeps the results in personnel or volunteer records for at least one year after the person last provided services.",
    keeperFr: "L’exploitant garde les résultats dans les dossiers du personnel ou des bénévoles pendant au moins un an après la dernière prestation.",
    unconfirmed: false,
    sources: [
      {
        label: "Prince Edward Island Early Learning and Child Care Act Regulations, current to 30 December 2023",
        href: "https://www.princeedwardisland.ca/sites/default/files/legislation/e.01g-early_learning_and_child_care_act_regulations.pdf",
        asOf: "2023-12-30",
      },
      rcmpSource,
    ],
  };
  return {
    code: "PE",
    summaryEn:
      "Prince Edward Island asks for a criminal record check and a vulnerable sector search in CPIC, within 8 weeks of starting, then at least every 3 years.",
    summaryFr:
      "L’Île-du-Prince-Édouard demande une vérification du casier judiciaire et une recherche du secteur vulnérable dans le CIPC, dans les 8 semaines suivant le début, puis au moins tous les 3 ans.",
    checks: [crc],
    roleNotes: {},
  };
}

function newfoundland(): BgJurisdiction {
  const crc: GuideCheck = {
    id: "nl_crc_vsc",
    kind: "crc_vsc",
    roles: ["centre_staff", "volunteer_student", "home_provider", "home_resident", "operator"],
    titleEn: "Certified criminal record check and vulnerable sector check",
    titleFr: "Certificat de casier judiciaire et vérification du secteur vulnérable",
    whatEn:
      "Employees, students, volunteers, and anyone who assists must not have access to children’s records or contact with the children unless a certified criminal record check or criminal-records screening certificate (often called a certificate of conduct) and a vulnerable sector check are on file. In a family home, residents 18 or older need those copies. Residents 16 or older sign a separate suitability consent. That consent is not itself a vulnerable sector check. A government web page that says a vulnerable sector check applies to residents over 16 is broader than the regulation. Follow the regulation.",
    whatFr:
      "Les employés, les étudiants, les bénévoles et toute personne qui aide ne doivent pas avoir accès aux dossiers des enfants ni de contact avec les enfants sans un certificat de casier judiciaire ou un certificat de filtrage des casiers judiciaires (souvent appelé certificat de conduite) et une vérification des dossiers du secteur vulnérable au dossier. En milieu familial, les résidents de 18 ans ou plus ont besoin de ces copies. Les résidents de 16 ans ou plus signent un consentement de pertinence distinct. Ce consentement n’est pas lui-même une vérification du secteur vulnérable. Une page web du gouvernement qui dit qu’une vérification du secteur vulnérable vise les résidents de plus de 16 ans est plus large que le règlement. Suivez le règlement.",
    whenEn:
      "Before access to children’s records or contact with children. The documents must be no more than 3 years old. Administrator documents for a new or renewed licence must be issued within the previous 3 months. Contact also requires first aid no more than 3 years old and a current immunization record. Those are separate from this check.",
    whenFr:
      "Avant l’accès aux dossiers des enfants ou le contact avec les enfants. Les documents doivent dater de 3 ans ou moins. Les documents d’un administrateur pour un permis nouveau ou renouvelé doivent avoir été délivrés dans les 3 mois précédents. Le contact exige aussi un secourisme de 3 ans ou moins et un dossier d’immunisation à jour. Ce sont des exigences distinctes.",
    whereEn:
      "The police service where the person lives, for example the Royal Newfoundland Constabulary in some cities, or the RCMP elsewhere. Family-home suitability consents use the department’s Child Care Suitability for Family Homes form.",
    whereFr:
      "Le service de police où la personne habite, par exemple la Royal Newfoundland Constabulary dans certaines villes, ou la GRC ailleurs. Les consentements de pertinence en milieu familial utilisent le formulaire du ministère sur la pertinence pour les foyers.",
    links: [rcmpLink],
    documentsEn: "The certified criminal record check or screening certificate, and the vulnerable sector check. For residents 16 or older, the suitability consent as well.",
    documentsFr: "Le certificat de casier ou de filtrage, et la vérification du secteur vulnérable. Pour les résidents de 16 ans ou plus, le consentement de pertinence aussi.",
    ...localCost(),
    renewal: { mode: "years", years: 3 },
    renewalEn: "The documents must be no more than 3 years old. Administrator documents for licensing must be issued within the previous 3 months.",
    renewalFr: "Les documents doivent dater de 3 ans ou moins. Les documents d’un administrateur pour le permis doivent avoir été délivrés dans les 3 mois précédents.",
    keeperEn: "Copies stay in the personnel record and, for residents 18 or older, in the family-home resident records. They must be satisfactory to the licensee or administrator.",
    keeperFr: "Les copies restent dans le dossier du personnel et, pour les résidents de 18 ans ou plus, dans les dossiers des résidents du milieu familial. Elles doivent satisfaire le titulaire ou l’administrateur.",
    unconfirmed: false,
    sources: [
      { label: "Newfoundland and Labrador NLR 39/17, ss. 4, 5, 16, and 74", asOf: READ },
      rcmpSource,
    ],
  };
  const consent: GuideCheck = {
    id: "nl_suitability",
    kind: "suitability_consent",
    roles: ["home_resident"],
    titleEn: "Suitability-information consent (residents 16+)",
    titleFr: "Consentement de pertinence (résidents de 16 ans ou plus)",
    whatEn:
      "All family-home residents 16 or older must consent to the licensing manager accessing provincial suitability information. This is not itself a vulnerable sector check. The vulnerable sector check for residents starts at 18.",
    whatFr:
      "Tous les résidents d’un milieu familial de 16 ans ou plus doivent consentir à ce que le gestionnaire des permis accède aux renseignements provinciaux de pertinence. Ce n’est pas en soi une vérification du secteur vulnérable. La vérification du secteur vulnérable pour les résidents commence à 18 ans.",
    whenEn: "With the family-home licence. No separate police renewal interval is stated for this consent.",
    whenFr: "Avec le permis du milieu familial. Aucun intervalle policier distinct n’est indiqué pour ce consentement.",
    whereEn: "The department’s Child Care Suitability for Family Homes form (Policy and Standards Manual, Appendix D).",
    whereFr: "Le formulaire du ministère sur la pertinence pour les foyers (manuel des politiques et normes, annexe D).",
    links: [],
    documentsEn: "The signed suitability consent.",
    documentsFr: "Le consentement de pertinence signé.",
    costPublished: false,
    costEn: "No fee is published for this consent form.",
    costFr: "Aucun frais n’est publié pour ce formulaire de consentement.",
    renewal: { mode: "none_published" },
    renewalEn: "No police renewal interval is published for the suitability consent. The criminal record and vulnerable sector documents for residents 18 or older must be no more than 3 years old.",
    renewalFr: "Aucun intervalle de renouvellement policier n’est publié pour le consentement de pertinence. Les documents de casier et de secteur vulnérable des résidents de 18 ans ou plus doivent dater de 3 ans ou moins.",
    keeperEn: "The licensee or administrator keeps the consent with the family-home records.",
    keeperFr: "Le titulaire ou l’administrateur garde le consentement avec les dossiers du milieu familial.",
    unconfirmed: false,
    sources: [{ label: "Newfoundland and Labrador NLR 39/17, s. 5(2)(b) and s. 74(a)", asOf: READ }],
  };
  return {
    code: "NL",
    summaryEn:
      "Newfoundland and Labrador keeps a certified criminal record check and a vulnerable sector check, no more than 3 years old, before contact with children. Home residents are split: consent at 16, police checks at 18.",
    summaryFr:
      "Terre-Neuve-et-Labrador conserve un certificat de casier et une vérification du secteur vulnérable, de 3 ans ou moins, avant le contact avec les enfants. Les résidents du milieu familial sont séparés : consentement à 16 ans, vérifications policières à 18 ans.",
    checks: [crc, consent],
    roleNotes: {},
  };
}

function yukon(): BgJurisdiction {
  const crc: GuideCheck = {
    id: "yt_crc",
    kind: "crc",
    roles: ["centre_staff", "home_provider", "home_resident", "operator"],
    titleEn: "Confidential police check for a criminal record",
    titleFr: "Enquête policière confidentielle sur le casier judiciaire",
    whatEn:
      "Licence applications need written permission to conduct a confidential police check for a criminal record on the applicant, any worker, and any resident 18 or older. The regulation does not use the words “vulnerable sector check.” A vulnerable sector check is often requested in practice. Whether it is legally required beyond a confidential police check is unconfirmed. Ask the licensing office or the RCMP whether they also want a vulnerable sector check for the role, and follow what they ask.",
    whatFr:
      "Les demandes de permis exigent une permission écrite pour une enquête policière confidentielle sur le casier judiciaire du demandeur, de tout travailleur et de tout résident de 18 ans ou plus. Le règlement n’utilise pas les mots « vérification du secteur vulnérable ». Une vérification du secteur vulnérable est souvent demandée en pratique. On ne peut pas confirmer qu’elle est exigée en droit au-delà de l’enquête confidentielle. Demandez au bureau des permis ou à la GRC s’ils veulent aussi une vérification du secteur vulnérable pour le rôle, et suivez ce qu’ils demandent.",
    whenEn:
      "All workers in a child care centre must have had that confidential police check before they begin work, and must be approved by the director. The director may approve a worker pending the check, then confirm or revoke approval. There is no renewal period written in the regulation. Family day home licence renewal paperwork does not include a new police check. Ask Early Learning and Child Care if they want an updated check at licence renewal or on a schedule.",
    whenFr:
      "Tous les travailleurs d’un centre doivent avoir eu cette enquête policière confidentielle avant de commencer à travailler, et être approuvés par le directeur. Le directeur peut approuver un travailleur en attendant la vérification, puis confirmer ou retirer l’approbation. Aucune période de renouvellement n’est écrite dans le règlement. Les documents de renouvellement d’un permis de garderie en milieu familial n’incluent pas une nouvelle enquête. Demandez au bureau de l’apprentissage et de la garde s’il veut une mise à jour au renouvellement ou selon un calendrier.",
    whereEn:
      "Yukon RCMP detachments. Most of the territory is served by the RCMP. For a family day home licence package: Early Learning and Child Care, earlylearning@yukon.ca, 867-667-3492.",
    whereFr:
      "Les détachements de la GRC du Yukon. La plus grande partie du territoire est desservie par la GRC. Pour un permis de garderie en milieu familial : Apprentissage et garde des jeunes enfants, earlylearning@yukon.ca, 867-667-3492.",
    links: [
      rcmpLink,
      {
        labelEn: "Get a licence for your family day home",
        labelFr: "Obtenir un permis pour une garderie en milieu familial",
        href: "https://yukon.ca/en/doing-business/licensing/get-licence-your-family-day-home",
      },
    ],
    documentsEn: "Written permission for the confidential police check, government ID, and whatever the RCMP detachment asks for.",
    documentsFr: "La permission écrite pour l’enquête confidentielle, une pièce d’identité, et ce que le détachement de la GRC demande.",
    ...localCost(" Fees are not published in the regulation.", " Les frais ne sont pas publiés dans le règlement."),
    renewal: { mode: "centre_policy" },
    renewalEn:
      "No renewal interval is written in the regulation. Ask Early Learning and Child Care, or set the centre’s own policy. Do not invent a number of years.",
    renewalFr:
      "Aucun intervalle de renouvellement n’est écrit dans le règlement. Demandez au bureau de l’apprentissage et de la garde, ou fixez la politique du centre. N’inventez pas un nombre d’années.",
    keeperEn: "The director’s approval and the police check are part of licensing and employment approval. Keep what the inspector expects to see in the staff file.",
    keeperFr: "L’approbation du directeur et l’enquête policière font partie du permis et de l’approbation d’emploi. Gardez ce que l’inspecteur s’attend à voir dans le dossier du personnel.",
    unconfirmed: true,
    unconfirmedEn:
      "A vulnerable sector check is not named in the regulation. Treat it as unconfirmed unless the licensing office or the RCMP asks for it.",
    unconfirmedFr:
      "La vérification du secteur vulnérable n’est pas nommée dans le règlement. Traitez-la comme non confirmée, sauf si le bureau des permis ou la GRC la demande.",
    sources: [
      {
        label: "Yukon O.I.C. 1995/087, Child Care Centre Program Regulation ss. 3 and 6, and Family Day Home Program Regulation s. 3",
        href: "https://laws.yukon.ca/cms/images/LEGISLATION/regs/oic1995_087.pdf",
        asOf: READ,
      },
      {
        label: "yukon.ca family day home page, updated 6 August 2026",
        href: "https://yukon.ca/en/doing-business/licensing/get-licence-your-family-day-home",
        asOf: "2026-08-06",
      },
      rcmpSource,
    ],
  };
  return {
    code: "YT",
    summaryEn:
      "Yukon requires a confidential police check for a criminal record before centre workers begin, plus director approval. It does not name a vulnerable sector check or a renewal interval.",
    summaryFr:
      "Le Yukon exige une enquête policière confidentielle sur le casier judiciaire avant que les travailleurs d’un centre commencent, plus l’approbation du directeur. Il ne nomme pas une vérification du secteur vulnérable ni un intervalle de renouvellement.",
    checks: [crc],
    roleNotes: {
      volunteer_student: {
        en: "The regulation’s “worker” rule is what was opened. It does not separately name volunteers or students. Ask Early Learning and Child Care before you treat a volunteer as exempt.",
        fr: "La règle du « travailleur » est celle qui a été ouverte. Elle ne nomme pas séparément les bénévoles ou les étudiants. Demandez au bureau de l’apprentissage et de la garde avant de traiter un bénévole comme exempté.",
      },
    },
  };
}

function nwt(): BgJurisdiction {
  const crc: GuideCheck = {
    id: "nt_crc_vsc",
    kind: "crc_vsc",
    roles: ["centre_staff", "volunteer_student", "home_provider", "home_resident", "operator"],
    titleEn: "Vulnerable sector check and criminal record check through the RCMP",
    titleFr: "Vérification du secteur vulnérable et vérification du casier judiciaire par la GRC",
    whatEn:
      "Before a staff person, substitute, or volunteer who is not a parent starts or attends, they give the operator both a vulnerable sector check and a criminal record check obtained through the RCMP. In a home-based facility, every adult who ordinarily lives in the residence provides the same checks. Parent volunteers are treated differently. Other volunteers need the check before contact and remain supervised.",
    whatFr:
      "Avant qu’un membre du personnel, un remplaçant ou un bénévole qui n’est pas un parent commence ou soit présent, il remet à l’exploitant une vérification du secteur vulnérable et une vérification du casier judiciaire obtenues par l’entremise de la GRC. Dans un service à domicile, chaque adulte qui habite ordinairement la résidence fournit les mêmes vérifications. Les parents bénévoles sont traités différemment. Les autres bénévoles ont besoin de la vérification avant le contact et restent supervisés.",
    whenEn:
      "Before the person starts work, or before a non-parent volunteer has contact. Adult residents: before the home-based facility opens, and before a new adult moves in. Then every 2 years. Report charges or convictions without delay.",
    whenFr:
      "Avant que la personne commence à travailler, ou avant qu’un bénévole qui n’est pas un parent ait un contact. Résidents adultes : avant l’ouverture du service à domicile, et avant qu’un nouvel adulte emménage. Puis tous les 2 ans. Signalez les accusations ou condamnations sans délai.",
    whereEn: "The local RCMP detachment. The operator sends copies to the Director of early learning and child care.",
    whereFr: "Le détachement local de la GRC. L’exploitant envoie des copies au directeur de l’apprentissage et de la garde.",
    links: [rcmpLink],
    documentsEn: "Both RCMP results: the vulnerable sector check and the criminal record check.",
    documentsFr: "Les deux résultats de la GRC : la vérification du secteur vulnérable et la vérification du casier judiciaire.",
    ...localCost(" Not published as a single territorial fee.", " Pas un tarif territorial unique."),
    renewal: { mode: "years", years: 2 },
    renewalEn: "Every 2 years. New charges or convictions must be reported to the operator immediately. The operator tells the Director.",
    renewalFr: "Tous les 2 ans. Les nouvelles accusations ou condamnations doivent être signalées à l’exploitant immédiatement. L’exploitant en informe le directeur.",
    keeperEn: "The operator keeps the copies and provides them to the Director.",
    keeperFr: "L’exploitant garde les copies et les fournit au directeur.",
    unconfirmed: false,
    sources: [
      { label: "Northwest Territories Early Learning and Child Care Regulations, R-098-2024, ss. 64–69, in force 15 November 2024", asOf: READ },
      rcmpSource,
    ],
  };
  return {
    code: "NT",
    summaryEn:
      "The Northwest Territories requires both a vulnerable sector check and a criminal record check through the RCMP, before the person starts, then every 2 years.",
    summaryFr:
      "Les Territoires du Nord-Ouest exigent une vérification du secteur vulnérable et une vérification du casier judiciaire par la GRC, avant le début, puis tous les 2 ans.",
    checks: [crc],
    roleNotes: {},
  };
}

function nunavut(): BgJurisdiction {
  const crc: GuideCheck = {
    id: "nu_crc",
    kind: "crc",
    roles: ["centre_staff", "volunteer_student", "home_provider", "home_resident", "operator"],
    titleEn: "Criminal record check before starting work",
    titleFr: "Vérification du casier judiciaire avant de commencer",
    whatEn:
      "The 2014 departmental handbook includes a criminal record check for all staff and volunteers before they start work in a facility. Ask the licensing office whether a vulnerable sector check is also required for the role today, and which home residents need a check. The Early Learning and Child Care Act, S.Nu. 2025, c. 12, received assent on 3 June 2025 and is not yet in force. Do not follow that Act’s 2-year rule until it is in force.",
    whatFr:
      "Le guide ministériel de 2014 comprend une vérification du casier judiciaire pour tout le personnel et les bénévoles avant qu’ils commencent à travailler dans une installation. Demandez au bureau des permis si une vérification du secteur vulnérable est aussi exigée pour le rôle aujourd’hui, et quels résidents d’un milieu familial ont besoin d’une vérification. La Loi sur l’apprentissage et la garde des jeunes enfants, L.Nun. 2025, ch. 12, a reçu la sanction le 3 juin 2025 et n’est pas encore en vigueur. Ne suivez pas la règle de 2 ans de cette loi tant qu’elle n’est pas en vigueur.",
    whenEn:
      "Before starting work, according to the handbook. A fixed “every X years” rule in the current regulations was not confirmed. The official regulations PDF could not be opened in the research pass. Ask your early childhood officer if they want an updated check.",
    whenFr:
      "Avant de commencer à travailler, selon le guide. Une règle fixe « tous les X ans » dans les règlements en vigueur n’a pas été confirmée. Le PDF officiel des règlements n’a pas pu être ouvert lors de la recherche. Demandez à votre agent de la petite enfance s’il veut une mise à jour.",
    whereEn: "The local RCMP detachment. For licensing questions, use the Department of Education early learning contacts on gov.nu.ca.",
    whereFr: "Le détachement local de la GRC. Pour les questions de permis, utilisez les contacts d’apprentissage et de garde du ministère de l’Éducation sur gov.nu.ca.",
    links: [
      rcmpLink,
      {
        labelEn: "Nunavut early learning and child care",
        labelFr: "Apprentissage et garde au Nunavut",
        href: "https://www.gov.nu.ca/en/education-and-schools/early-learning-and-child-care",
      },
      {
        labelEn: "The 2025 Act is not yet in force",
        labelFr: "La loi de 2025 n’est pas encore en vigueur",
        href: "https://www.gov.nu.ca/en/education-and-schools/nunavuts-new-early-learning-and-child-care-act",
      },
    ],
    documentsEn: "What the RCMP detachment and the early childhood officer ask for. If criminal-record authorizations still go through the Director, use the officer’s forms.",
    documentsFr: "Ce que le détachement de la GRC et l’agent de la petite enfance demandent. Si les autorisations de casier passent encore par le directeur, utilisez les formulaires de l’agent.",
    ...localCost(),
    renewal: { mode: "unconfirmed" },
    renewalEn:
      "Unconfirmed. Do not use a 2-year renewal. That interval is in the 2025 Act, which is not in force. A centre may set its own policy and ask the early childhood officer what they expect.",
    renewalFr:
      "Non confirmé. N’utilisez pas un renouvellement de 2 ans. Cet intervalle est dans la loi de 2025, qui n’est pas en vigueur. Un centre peut fixer sa propre politique et demander à l’agent de la petite enfance ce qu’il attend.",
    keeperEn: "Keep what the inspector and the Director of Child Day Care Services require.",
    keeperFr: "Gardez ce que l’inspecteur et le directeur des services de garde exigent.",
    unconfirmed: true,
    unconfirmedEn:
      "The current renewal interval is unconfirmed. The in-force regulations PDF was not opened. The 2025 Act’s 2-year rule is not current law.",
    unconfirmedFr:
      "L’intervalle de renouvellement actuel n’est pas confirmé. Le PDF des règlements en vigueur n’a pas été ouvert. La règle de 2 ans de la loi de 2025 n’est pas le droit actuel.",
    sources: [
      {
        label: "Government of Nunavut: the 2025 Early Learning and Child Care Act is not yet in force. The Child Day Care Act and Standards Regulations remain in force.",
        href: "https://www.gov.nu.ca/en/education-and-schools/nunavuts-new-early-learning-and-child-care-act",
        asOf: READ,
      },
      {
        label: "2014 departmental handbook: criminal record check for all staff and volunteers before starting work. Exact regulation wording was not independently opened.",
        asOf: READ,
      },
      rcmpSource,
    ],
  };
  return {
    code: "NU",
    summaryEn:
      "Current Nunavut rules still come from the Child Day Care Act. Staff and volunteers need a criminal record check before they start. A renewal interval was not confirmed. The 2025 Act is not in force.",
    summaryFr:
      "Les règles actuelles du Nunavut viennent encore de la Child Day Care Act. Le personnel et les bénévoles ont besoin d’une vérification du casier avant de commencer. Un intervalle de renouvellement n’a pas été confirmé. La loi de 2025 n’est pas en vigueur.",
    checks: [crc],
    roleNotes: {
      home_resident: {
        en: "Ask the licensing office which residents need a check under the current rules. Do not apply the 2025 Act’s adult-resident rule until that Act is in force.",
        fr: "Demandez au bureau des permis quels résidents ont besoin d’une vérification selon les règles actuelles. N’appliquez pas la règle de la loi de 2025 sur les résidents adultes tant que cette loi n’est pas en vigueur.",
      },
    },
  };
}

export const BG_JURISDICTIONS: readonly BgJurisdiction[] = [
  bc(),
  alberta(),
  saskatchewan(),
  manitoba(),
  ontario(),
  quebec(),
  newBrunswick(),
  novaScotia(),
  pei(),
  newfoundland(),
  yukon(),
  nwt(),
  nunavut(),
];
