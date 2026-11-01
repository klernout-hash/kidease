/**
 * Province curriculum pack. Goal lines are KidEase wording.
 * Framework text stays on the official page. ASQ and other licensed tools are not here.
 * No @/ imports so Node tests can load this file.
 */

import { suppressCount } from "../gov/k-anonymity.ts";

export const PROVINCE_CODES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const AGE_BANDS = ["infant", "toddler", "preschool", "school"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GOAL_THEMES = ["belong", "well", "play", "talk", "care"] as const;
export type GoalTheme = (typeof GOAL_THEMES)[number];

export type RuleStatus = "confirmed" | "placeholder";

export type FrameworkRecord = {
  province: ProvinceCode;
  name: string;
  yearLabel: string;
  yearStatus: RuleStatus;
  publisher: string;
  url: string;
  requirement: string;
  requirementStatus: RuleStatus;
  regulation: string;
  regulationStatus: RuleStatus;
  credit: string;
};

export type CurriculumGoal = {
  id: string;
  province: ProvinceCode;
  theme: GoalTheme;
  en: string;
  fr: string;
  credit: string;
  sourceUrl: string;
};

export type RequiredDoc = {
  id: string;
  province: ProvinceCode;
  titleEn: string;
  titleFr: string;
  confirmation: RuleStatus;
  citation: string;
  sourceUrl: string;
  review: "annual" | "none";
  reviewStatus: RuleStatus;
  promptsEn: readonly string[];
  promptsFr: readonly string[];
};

export type CurriculumActivity = {
  id: string;
  province: ProvinceCode;
  age: AgeBand;
  theme: GoalTheme;
  goalId: string;
  titleEn: string;
  titleFr: string;
  materialsEn: string;
  materialsFr: string;
  stepsEn: readonly string[];
  stepsFr: readonly string[];
};

export const LICENSED_TOOLS_NOTE =
  "Licensed screening tools such as ASQ are not part of this pack. Use the publisher's own form if you bought a licence.";

const FRAMEWORKS: readonly FrameworkRecord[] = [
  {
    province: "BC",
    name: "British Columbia Early Learning Framework",
    yearLabel: "2019",
    yearStatus: "confirmed",
    publisher: "Province of British Columbia",
    url: "https://www2.gov.bc.ca/gov/content/education-training/early-learning/teach/early-learning-framework",
    requirement: "Provincial guide for early learning settings. A rule that every licence must file a statement was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "No section confirmed in this pass.",
    regulationStatus: "placeholder",
    credit: "Province of British Columbia. British Columbia Early Learning Framework (2019).",
  },
  {
    province: "AB",
    name: "Flight: Alberta's Early Learning and Care Framework",
    yearLabel: "2014, renamed 2018",
    yearStatus: "confirmed",
    publisher: "Makovichuk, Hewes, Lirette, and Thomas",
    url: "https://www.flightframework.ca/",
    requirement: "A program plan is required. The regulation does not name Flight. Flight text is CC BY-NC-ND, so KidEase does not copy it.",
    requirementStatus: "placeholder",
    regulation: "Alta. Reg. 143/2008, s. 2(a), s. 5.1, and s. 6 (program plan).",
    regulationStatus: "confirmed",
    credit: "Makovichuk, L., Hewes, J., Lirette, P., and Thomas, N. Flight: Alberta's Early Learning and Care Framework. flightframework.ca. CC BY-NC-ND 4.0.",
  },
  {
    province: "SK",
    name: "Play and Exploration: Early Learning Program Guide",
    yearLabel: "2008 (French imprint). English file labelled Sept 2024.",
    yearStatus: "confirmed",
    publisher: "Saskatchewan Ministry of Education",
    url: "https://publications.saskatchewan.ca/api/v1/products/74066/formats/82946/download",
    requirement: "A written philosophy and a daily program are required. Naming this guide in the philosophy is guidance, not confirmed as the only allowed text.",
    requirementStatus: "placeholder",
    regulation: "The Child Care Regulations, 2015, C-7.31 Reg 1, s. 14.",
    regulationStatus: "confirmed",
    credit: "Saskatchewan Ministry of Education. Play and Exploration: Early Learning Program Guide.",
  },
  {
    province: "MB",
    name: "Early Returns: Manitoba's Early Learning and Child Care Curriculum Framework",
    yearLabel: "Year not printed on the pages opened",
    yearStatus: "placeholder",
    publisher: "Manitoba Education and Early Childhood Learning",
    url: "https://www.gov.mb.ca/education/childcare/resources/pubs/early_returns.pdf",
    requirement: "A curriculum statement is required for the licence, and the daily program must match it.",
    requirementStatus: "confirmed",
    regulation: "Man. Reg. 62/86, s. 5(j), s. 5(k), and s. 10(2).",
    regulationStatus: "confirmed",
    credit: "Manitoba. Early Returns: Manitoba's Early Learning and Child Care Curriculum Framework.",
  },
  {
    province: "ON",
    name: "How Does Learning Happen? Ontario's Pedagogy for the Early Years",
    yearLabel: "2014",
    yearStatus: "confirmed",
    publisher: "Queen's Printer for Ontario",
    url: "https://www.ontario.ca/page/how-does-learning-happen-ontarios-pedagogy-early-years",
    requirement: "Licensed child care needs a program statement that matches the Minister's policy, reviewed at least once a year.",
    requirementStatus: "confirmed",
    regulation: "Child Care and Early Years Act, 2014, s. 55(3); O. Reg. 137/15, s. 46.",
    regulationStatus: "confirmed",
    credit: "Queen's Printer for Ontario. How Does Learning Happen? (2014).",
  },
  {
    province: "QC",
    name: "Accueillir la petite enfance",
    yearLabel: "2019",
    yearStatus: "confirmed",
    publisher: "Ministère de la Famille et Les Publications du Québec",
    url: "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/programme-educatif",
    requirement: "Each educational childcare service applies an educational program and gives it to parents at no cost.",
    requirementStatus: "confirmed",
    regulation: "Educational Childcare Act, CQLR c. S-4.1.1, s. 5.",
    regulationStatus: "confirmed",
    credit: "Ministère de la Famille. Accueillir la petite enfance (2019).",
  },
  {
    province: "NB",
    name: "New Brunswick Curriculum Framework for Early Learning and Child Care, English and French",
    yearLabel: "2008 (English book)",
    yearStatus: "confirmed",
    publisher: "Government of New Brunswick",
    url: "https://www2.gnb.ca/content/gnb/en/departments/education/elcc/content/curriculum/curriculum_framework.html",
    requirement: "Designated facilities use the English or French provincial framework and say so in the parent handbook. Undesignated licences were not confirmed.",
    requirementStatus: "confirmed",
    regulation: "Operator handbook for designated facilities, s. 3.1.2. Statute section number not confirmed.",
    regulationStatus: "placeholder",
    credit: "Government of New Brunswick. New Brunswick Curriculum Framework for Early Learning and Child Care (English, 2008). French framework title confirmed in the handbook; its file address was not opened.",
  },
  {
    province: "NS",
    name: "Capable, Confident, and Curious: Nova Scotia's Early Learning Curriculum Framework",
    yearLabel: "2025 (a 2018 edition also exists)",
    yearStatus: "confirmed",
    publisher: "Nova Scotia Department of Education and Early Childhood Development",
    url: "https://www.ednet.ns.ca/docs/nsel_curriculum_framework_en.pdf",
    requirement: "The department says the framework is used in regulated programs. The regulation requires a daily program. A filed statement that names the framework was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "Early Learning and Child Care Regulations, s. 18(1) and s. 18(4).",
    regulationStatus: "confirmed",
    credit: "Province of Nova Scotia. Capable, Confident, and Curious (2025).",
  },
  {
    province: "PE",
    name: "PEI Early Learning Framework: Relationships, Environments, Experiences",
    yearLabel: "2011",
    yearStatus: "confirmed",
    publisher: "PEI Department of Education and Early Childhood Development (prepared by Kathleen Flanagan)",
    url: "https://www.princeedwardisland.ca/sites/default/files/publications/eecd_eyfrwrk_full.pdf",
    requirement: "A current rule that every licence must file this framework was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "No current section confirmed in this pass.",
    regulationStatus: "placeholder",
    credit: "Government of Prince Edward Island. PEI Early Learning Framework (2011).",
  },
  {
    province: "NL",
    name: "Navigating the Early Years: An Early Childhood Learning Framework",
    yearLabel: "2019",
    yearStatus: "confirmed",
    publisher: "Newfoundland and Labrador Department of Education and Early Childhood Development",
    url: "https://www.gov.nl.ca/education/files/Early-Learning-Framework.pdf",
    requirement: "The policy manual names this as the provincial framework. A regulation that requires a written statement was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "No section confirmed in this pass.",
    regulationStatus: "placeholder",
    credit: "Government of Newfoundland and Labrador. Navigating the Early Years (2019).",
  },
  {
    province: "YT",
    name: "Yukon early learning framework (not published yet)",
    yearLabel: "Act assented 2025. Not in force.",
    yearStatus: "confirmed",
    publisher: "Government of Yukon",
    url: "https://yukon.ca/en/news/early-learning-and-child-care-act-receives-assent-yukon-legislative-assembly",
    requirement: "The Act tells the director to write and publish a framework with Yukon First Nations. No framework document was found. Goals below are KidEase drafts.",
    requirementStatus: "placeholder",
    regulation: "Early Learning and Child Care Act, S.Y. 2025, c. 3, s. 7. Not yet in force.",
    regulationStatus: "confirmed",
    credit: "Statutes of Yukon 2025, c. 3. No framework booklet to credit yet.",
  },
  {
    province: "NT",
    name: "Northwest Territories Early Learning Framework",
    yearLabel: "June 2025",
    yearStatus: "confirmed",
    publisher: "Government of the Northwest Territories",
    url: "https://www.ece.gov.nt.ca/sites/ece/files/resources/nwt_elf_en_0.pdf",
    requirement: "Released as a resource for educators. A filing duty was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "No section confirmed in this pass.",
    regulationStatus: "placeholder",
    credit: "Government of the Northwest Territories. Early Learning Framework (2025).",
  },
  {
    province: "NU",
    name: "Nunavut Early Learning and Child Care Quality Framework",
    yearLabel: "June 2023",
    yearStatus: "confirmed",
    publisher: "Government of Nunavut",
    url: "https://www.gov.nu.ca/sites/default/files/documents/2023-12/Nunavut%20Early%20Learning%20and%20Childcare%20Framework_EN.pdf",
    requirement: "The framework says programs should line up with it. A filing duty was not confirmed.",
    requirementStatus: "placeholder",
    regulation: "No section confirmed in this pass.",
    regulationStatus: "placeholder",
    credit: "Government of Nunavut. Early Learning and Child Care Quality Framework (2023).",
  },
];

const GOAL_LINES: Record<ProvinceCode, Record<GoalTheme, { en: string; fr: string }>> = {
  BC: {
    belong: { en: "Children feel they belong with their people", fr: "Les enfants sentent qu'ils ont leur place avec leurs proches" },
    well: { en: "Children are well, rested, and included", fr: "Les enfants vont bien, se reposent et sont inclus" },
    play: { en: "Children explore with their hands and questions", fr: "Les enfants explorent avec leurs mains et leurs questions" },
    talk: { en: "Children share ideas in the languages of their family", fr: "Les enfants partagent des idées dans les langues de leur famille" },
    care: { en: "Children help care for the place they play", fr: "Les enfants aident à prendre soin de l'endroit où ils jouent" },
  },
  AB: {
    belong: { en: "Children take part with their family and educators", fr: "Les enfants participent avec leur famille et les éducateurs" },
    well: { en: "Children are cared for in body and feelings", fr: "Les enfants sont soutenus dans leur corps et leurs émotions" },
    play: { en: "Children play to make sense of the day", fr: "Les enfants jouent pour comprendre leur journée" },
    talk: { en: "Children try words, stories, and signs", fr: "Les enfants essaient des mots, des histoires et des signes" },
    care: { en: "Children look after friends and shared spaces", fr: "Les enfants prennent soin des amis et des lieux partagés" },
  },
  SK: {
    belong: { en: "Children are seen as able learners", fr: "Les enfants sont vus comme des apprenants capables" },
    well: { en: "Children have time to move and to rest", fr: "Les enfants ont du temps pour bouger et pour se reposer" },
    play: { en: "Children learn by playing and exploring", fr: "Les enfants apprennent en jouant et en explorant" },
    talk: { en: "Children talk, listen, and make marks", fr: "Les enfants parlent, écoutent et font des traces" },
    care: { en: "Warm relationships guide the room", fr: "Des liens chaleureux guident la salle" },
  },
  MB: {
    belong: { en: "Children feel safe with people they know", fr: "Les enfants se sentent en sécurité avec des personnes qu'ils connaissent" },
    well: { en: "Children move, rest, and eat in ways that fit them", fr: "Les enfants bougent, se reposent et mangent à leur rythme" },
    play: { en: "Children play with ideas through the day", fr: "Les enfants jouent avec des idées toute la journée" },
    talk: { en: "Children try words, songs, and mark-making", fr: "Les enfants essaient des mots, des chansons et des traces" },
    care: { en: "Children notice differences and help each other", fr: "Les enfants remarquent les différences et s'entraident" },
  },
  ON: {
    belong: { en: "The child feels they belong here", fr: "L'enfant sent qu'il a sa place ici" },
    well: { en: "The child is well in body and feelings", fr: "L'enfant va bien dans son corps et ses émotions" },
    play: { en: "The child is busy with questions and play", fr: "L'enfant est occupé par ses questions et son jeu" },
    talk: { en: "The child shares ideas in many ways", fr: "L'enfant partage ses idées de plusieurs façons" },
    care: { en: "The child helps with the life of the group", fr: "L'enfant aide à la vie du groupe" },
  },
  QC: {
    belong: { en: "The child feels connected to the people here", fr: "L'enfant se sent en lien avec les personnes ici" },
    well: { en: "The child moves, rests, and cares for their body", fr: "L'enfant bouge, se repose et prend soin de son corps" },
    play: { en: "The child plays in order to understand", fr: "L'enfant joue pour comprendre" },
    talk: { en: "The child speaks, listens, and expresses ideas", fr: "L'enfant parle, écoute et s'exprime" },
    care: { en: "The child gets used to life in a group", fr: "L'enfant s'habitue à la vie en groupe" },
  },
  NB: {
    belong: { en: "Children feel safe and welcomed", fr: "L'enfant se sent en sécurité et accueilli" },
    well: { en: "Children are looked after in health and feelings", fr: "L'enfant est soutenu dans sa santé et ses émotions" },
    play: { en: "Children play, invent, and try solutions", fr: "L'enfant joue, invente et cherche des solutions" },
    talk: { en: "Children communicate in ways that count", fr: "L'enfant communique de plusieurs façons" },
    care: { en: "Children practise fairness and care", fr: "L'enfant apprend à être juste et attentionné" },
  },
  NS: {
    belong: { en: "Children feel they have a place in the group", fr: "Les enfants sentent qu'ils ont une place dans le groupe" },
    well: { en: "Children look after their own well-being with help", fr: "Les enfants prennent soin de leur bien-être avec de l'aide" },
    play: { en: "Children discover and invent", fr: "Les enfants découvrent et inventent" },
    talk: { en: "Children use language to connect", fr: "Les enfants utilisent le langage pour créer des liens" },
    care: { en: "Children care for people and the outdoors", fr: "Les enfants prennent soin des personnes et du dehors" },
  },
  PE: {
    belong: { en: "Children feel they belong and are known", fr: "Les enfants sentent qu'ils sont connus et à leur place" },
    well: { en: "Children are well and safe in the day", fr: "Les enfants vont bien et sont en sécurité dans la journée" },
    play: { en: "Children explore and discover", fr: "Les enfants explorent et découvrent" },
    talk: { en: "Children express ideas with words and marks", fr: "Les enfants expriment des idées avec des mots et des traces" },
    care: { en: "Children grow a sense of who they are", fr: "Les enfants construisent une idée d'eux-mêmes" },
  },
  NL: {
    belong: { en: "Children are well and feel they belong", fr: "Les enfants vont bien et sentent qu'ils ont leur place" },
    well: { en: "Children have care that matches their needs", fr: "Les enfants reçoivent des soins adaptés à leurs besoins" },
    play: { en: "Children play and explore", fr: "Les enfants jouent et explorent" },
    talk: { en: "Children communicate with people they trust", fr: "Les enfants communiquent avec des personnes de confiance" },
    care: { en: "Children contribute to the group", fr: "Les enfants contribuent au groupe" },
  },
  YT: {
    belong: { en: "Draft: children feel included while the Yukon framework is unpublished", fr: "Brouillon : les enfants se sentent inclus en attendant le cadre du Yukon" },
    well: { en: "Draft: children are well and included", fr: "Brouillon : les enfants vont bien et sont inclus" },
    play: { en: "Draft: children explore at their pace", fr: "Brouillon : les enfants explorent à leur rythme" },
    talk: { en: "Draft: children use home languages and English or French", fr: "Brouillon : les enfants utilisent la langue du foyer et l'anglais ou le français" },
    care: { en: "Draft: local First Nations priorities are named by the community, not by KidEase", fr: "Brouillon : les priorités des Premières Nations viennent de la communauté, pas de KidEase" },
  },
  NT: {
    belong: { en: "Children belong with family, educators, and community", fr: "Les enfants ont leur place avec la famille, les éducateurs et la communauté" },
    well: { en: "Children are well", fr: "Les enfants vont bien" },
    play: { en: "Children explore", fr: "Les enfants explorent" },
    talk: { en: "Children communicate", fr: "Les enfants communiquent" },
    care: { en: "Children learn with the land around them", fr: "Les enfants apprennent avec le territoire autour d'eux" },
  },
  NU: {
    belong: { en: "The child is at the centre of the day", fr: "L'enfant est au centre de la journée" },
    well: { en: "Care follows the child's pace", fr: "Les soins suivent le rythme de l'enfant" },
    play: { en: "Play leaves room for family ways of learning", fr: "Le jeu laisse de la place aux façons d'apprendre de la famille" },
    talk: { en: "Families are the child's first teachers", fr: "Les familles sont les premiers enseignants de l'enfant" },
    care: { en: "The community helps children learn", fr: "La communauté aide les enfants à apprendre" },
  },
};

const DOC_PROMPTS: Record<ProvinceCode, { en: readonly string[]; fr: readonly string[] }> = {
  BC: {
    en: ["What do children practise in play this week?", "How do families see that practice?"],
    fr: ["Que pratiquent les enfants dans le jeu cette semaine?", "Comment les familles voient-elles cette pratique?"],
  },
  AB: {
    en: ["What is in your program plan, in your own words?", "What will you change if the director asks?"],
    fr: ["Que contient votre plan de programme, dans vos mots?", "Que changerez-vous si le directeur le demande?"],
  },
  SK: {
    en: ["What is your philosophy, in your own words?", "How does today's program match that philosophy?"],
    fr: ["Quelle est votre philosophie, dans vos mots?", "Comment le programme du jour suit-il cette philosophie?"],
  },
  MB: {
    en: ["What do you believe about how children learn?", "How do play, care, and routines fit that belief?", "How will you watch and change the plan?"],
    fr: ["Que croyez-vous sur la façon dont les enfants apprennent?", "Comment le jeu, les soins et les routines suivent-ils cette idée?", "Comment allez-vous observer et ajuster le plan?"],
  },
  ON: {
    en: ["How do children feel they belong?", "How do you support health and feelings?", "How do children explore and share ideas?", "When did you last review this statement?"],
    fr: ["Comment les enfants sentent-ils qu'ils ont leur place?", "Comment soutenez-vous la santé et les émotions?", "Comment les enfants explorent-ils et partagent-ils leurs idées?", "Quand avez-vous revu cet énoncé?"],
  },
  QC: {
    en: ["What is your educational program, in your own words?", "How do you give that program to parents at no cost?"],
    fr: ["Quel est votre programme éducatif, dans vos mots?", "Comment remettez-vous ce programme aux parents sans frais?"],
  },
  NB: {
    en: ["Which New Brunswick framework do you use, English or French?", "How do families see that choice in the day?"],
    fr: ["Quel cadre du Nouveau-Brunswick utilisez-vous, en anglais ou en français?", "Comment les familles voient-elles ce choix dans la journée?"],
  },
  NS: {
    en: ["What does a good day include for every child?", "What extra daily-program rule from the Minister do you follow?"],
    fr: ["Que comprend une bonne journée pour chaque enfant?", "Quelle règle supplémentaire du ministre suivez-vous pour le programme quotidien?"],
  },
  PE: {
    en: ["How do relationships, the room, and experiences work together?", "Who is this note for: an Early Years Centre or another licence?"],
    fr: ["Comment les relations, la salle et les expériences vont-elles ensemble?", "Cette note est-elle pour un Early Years Centre ou un autre permis?"],
  },
  NL: {
    en: ["How does the day give children time to play and to belong?", "What did you take from the provincial framework, in your own words?"],
    fr: ["Comment la journée donne-t-elle aux enfants du temps pour jouer et pour être à leur place?", "Qu'avez-vous retenu du cadre provincial, dans vos mots?"],
  },
  YT: {
    en: ["This is a draft until Yukon publishes its framework.", "What would you want the director to know about your program?"],
    fr: ["Ceci est un brouillon tant que le Yukon n'a pas publié son cadre.", "Que voulez-vous que le directeur sache de votre programme?"],
  },
  NT: {
    en: ["How does the week welcome the languages and cultures in your room?", "What will children explore?"],
    fr: ["Comment la semaine accueille-t-elle les langues et les cultures de votre salle?", "Qu'est-ce que les enfants vont explorer?"],
  },
  NU: {
    en: ["How is the child at the centre of this plan?", "What do families want you to keep doing?"],
    fr: ["Comment l'enfant est-il au centre de ce plan?", "Que veulent les familles que vous continuiez?"],
  },
};

const DOC_META: Record<ProvinceCode, Omit<RequiredDoc, "province" | "promptsEn" | "promptsFr">> = {
  BC: {
    id: "bc-program-notes",
    titleEn: "Program notes",
    titleFr: "Notes de programme",
    confirmation: "placeholder",
    citation: "No filing rule confirmed.",
    sourceUrl: "https://www2.gov.bc.ca/gov/content/education-training/early-learning/teach/early-learning-framework",
    review: "none",
    reviewStatus: "placeholder",
  },
  AB: {
    id: "ab-program-plan",
    titleEn: "Program plan",
    titleFr: "Plan de programme",
    confirmation: "confirmed",
    citation: "Alta. Reg. 143/2008, s. 2(a), s. 5.1, and s. 6.",
    sourceUrl: "http://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html",
    review: "none",
    reviewStatus: "placeholder",
  },
  SK: {
    id: "sk-philosophy",
    titleEn: "Philosophy and daily program",
    titleFr: "Philosophie et programme quotidien",
    confirmation: "confirmed",
    citation: "The Child Care Regulations, 2015, s. 14.",
    sourceUrl: "https://publications.saskatchewan.ca/api/v1/products/73483/formats/82271/download",
    review: "none",
    reviewStatus: "placeholder",
  },
  MB: {
    id: "mb-curriculum-statement",
    titleEn: "Curriculum statement",
    titleFr: "Énoncé de programme",
    confirmation: "confirmed",
    citation: "Man. Reg. 62/86, s. 5(j), s. 5(k), and s. 10(2).",
    sourceUrl: "https://web2.gov.mb.ca/laws/regs/current/_pdf-regs.php?reg=62/86",
    review: "annual",
    reviewStatus: "placeholder",
  },
  ON: {
    id: "on-program-statement",
    titleEn: "Program statement",
    titleFr: "Énoncé de programme",
    confirmation: "confirmed",
    citation: "O. Reg. 137/15, s. 46, under the Minister's policy for How Does Learning Happen?",
    sourceUrl: "https://files.ontario.ca/edu-1/edu-minister-policy-statement-program-cceya-en-2021-03-10.pdf",
    review: "annual",
    reviewStatus: "confirmed",
  },
  QC: {
    id: "qc-programme",
    titleEn: "Educational program",
    titleFr: "Programme éducatif",
    confirmation: "confirmed",
    citation: "Educational Childcare Act, s. 5.",
    sourceUrl: "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/programme-educatif",
    review: "none",
    reviewStatus: "placeholder",
  },
  NB: {
    id: "nb-handbook",
    titleEn: "Framework choice for the parent handbook",
    titleFr: "Choix du cadre pour le guide des parents",
    confirmation: "confirmed",
    citation: "Designated facilities, operator handbook s. 3.1.2. Statute section not confirmed.",
    sourceUrl: "https://www2.gnb.ca/content/dam/gnb/Departments/ed/pdf/ELCC/operator-handbook.pdf",
    review: "annual",
    reviewStatus: "placeholder",
  },
  NS: {
    id: "ns-daily-program",
    titleEn: "Daily program",
    titleFr: "Programme quotidien",
    confirmation: "confirmed",
    citation: "Early Learning and Child Care Regulations, s. 18.",
    sourceUrl: "https://novascotia.ca/JUST/regulations/regs/elcc.htm",
    review: "none",
    reviewStatus: "placeholder",
  },
  PE: {
    id: "pe-notes",
    titleEn: "Early learning notes",
    titleFr: "Notes d'apprentissage",
    confirmation: "placeholder",
    citation: "No current filing rule confirmed.",
    sourceUrl: "https://www.princeedwardisland.ca/en/topic/early-childhood-education",
    review: "none",
    reviewStatus: "placeholder",
  },
  NL: {
    id: "nl-notes",
    titleEn: "Program description",
    titleFr: "Description du programme",
    confirmation: "placeholder",
    citation: "Framework named in the policy manual. Filing rule not confirmed.",
    sourceUrl: "https://www.gov.nl.ca/education/files/Early-Learning-Framework.pdf",
    review: "none",
    reviewStatus: "placeholder",
  },
  YT: {
    id: "yt-plan",
    titleEn: "Early learning plan draft",
    titleFr: "Brouillon de plan d'apprentissage",
    confirmation: "placeholder",
    citation: "S.Y. 2025, c. 3, s. 7. Act not in force. No published framework.",
    sourceUrl: "https://laws.yukon.ca/cms/images/LEGISLATION/PRINCIPAL/2025/2025-0003/2025-0003.pdf",
    review: "none",
    reviewStatus: "placeholder",
  },
  NT: {
    id: "nt-notes",
    titleEn: "Program notes",
    titleFr: "Notes de programme",
    confirmation: "placeholder",
    citation: "No filing rule confirmed.",
    sourceUrl: "https://www.gov.nt.ca/en/newsroom/release-early-learning-framework",
    review: "none",
    reviewStatus: "placeholder",
  },
  NU: {
    id: "nu-notes",
    titleEn: "Alignment notes",
    titleFr: "Notes d'alignement",
    confirmation: "placeholder",
    citation: "No filing rule confirmed.",
    sourceUrl: "https://www.gov.nu.ca/sites/default/files/documents/2023-12/Nunavut%20Early%20Learning%20and%20Childcare%20Framework_EN.pdf",
    review: "none",
    reviewStatus: "placeholder",
  },
};

type Flavor = { placeEn: string; placeFr: string; propEn: string; propFr: string };

const FLAVOR: Record<ProvinceCode, Flavor> = {
  BC: { placeEn: "a rainy window", placeFr: "une fenêtre sous la pluie", propEn: "cedar cones and a bowl of water", propFr: "des cônes de cèdre et un bol d'eau" },
  AB: { placeEn: "a bright prairie afternoon", placeFr: "un après-midi clair dans la prairie", propEn: "dry grass and a scarf for the wind", propFr: "de l'herbe sèche et un foulard pour le vent" },
  SK: { placeEn: "a wide sky outside", placeFr: "un grand ciel dehors", propEn: "a cardboard box and a blanket", propFr: "une boîte de carton et une couverture" },
  MB: { placeEn: "a winter entryway", placeFr: "une entrée en hiver", propEn: "snow pants and a basket of mitts", propFr: "des pantalons de neige et un panier de mitaines" },
  ON: { placeEn: "the neighbourhood block", placeFr: "le pâté de maisons du quartier", propEn: "leaves, sticks, and a paper map you draw", propFr: "des feuilles, des bâtons et une carte que vous dessinez" },
  QC: { placeEn: "the coat room", placeFr: "le vestiaire", propEn: "tuques, blocs et un livre d'images", propFr: "des tuques, des blocs et un livre d'images" },
  NB: { placeEn: "a bilingual hello at the door", placeFr: "un bonjour bilingue à la porte", propEn: "two labels, English and French, on the same basket", propFr: "deux étiquettes, en anglais et en français, sur le même panier" },
  NS: { placeEn: "a foggy morning window", placeFr: "une fenêtre un matin de brume", propEn: "boats you cut from paper and a bowl of warm water", propFr: "des bateaux découpés dans du papier et un bol d'eau tiède" },
  PE: { placeEn: "a windy yard", placeFr: "une cour venteuse", propEn: "red soil in a tray and a small shovel", propFr: "de la terre rouge dans un plateau et une petite pelle" },
  NL: { placeEn: "a kitchen table by the window", placeFr: "une table de cuisine près de la fenêtre", propEn: "a pot, a spoon, and a song you already know", propFr: "une casserole, une cuillère et une chanson que vous connaissez" },
  YT: { placeEn: "a long summer evening or a short winter day", placeFr: "une longue soirée d'été ou un jour d'hiver court", propEn: "a lamp and a dark cloth for day and night play", propFr: "une lampe et un tissu foncé pour jouer au jour et à la nuit" },
  NT: { placeEn: "the door after outdoor time", placeFr: "la porte après le temps dehors", propEn: "ice cubes in a tray and warm mittens", propFr: "des glaçons dans un plateau et des mitaines chaudes" },
  NU: { placeEn: "a circle on the floor", placeFr: "un cercle sur le plancher", propEn: "a family photo the parent chose to share, or a drawing if there is no photo", propFr: "une photo de famille que le parent a choisi de partager, ou un dessin s'il n'y a pas de photo" },
};

type Template = {
  theme: GoalTheme;
  age: AgeBand;
  titleEn: (f: Flavor) => string;
  titleFr: (f: Flavor) => string;
  materialsEn: (f: Flavor) => string;
  materialsFr: (f: Flavor) => string;
  stepsEn: (f: Flavor) => readonly string[];
  stepsFr: (f: Flavor) => readonly string[];
};

const TEMPLATES: readonly Template[] = [
  {
    theme: "belong",
    age: "toddler",
    titleEn: (f) => `Hello circle near ${f.placeEn}`,
    titleFr: (f) => `Cercle de bonjour près de ${f.placeFr}`,
    materialsEn: (f) => f.propEn,
    materialsFr: (f) => f.propFr,
    stepsEn: (f) => [
      `Sit where everyone can see ${f.placeEn}.`,
      "Say each child's name and wait. A wave counts.",
      "Pass one object from the basket. The child decides to hold it or pass it on.",
    ],
    stepsFr: (f) => [
      `Asseyez-vous là où tout le monde voit ${f.placeFr}.`,
      "Dites le nom de chaque enfant et attendez. Un signe de la main compte.",
      "Passez un objet du panier. L'enfant décide de le garder ou de le passer.",
    ],
  },
  {
    theme: "well",
    age: "preschool",
    titleEn: (f) => `Body break with ${f.propEn.split(" and ")[0]}`,
    titleFr: () => `Pause pour le corps`,
    materialsEn: (f) => `${f.propEn}. A mat if you have one.`,
    materialsFr: (f) => `${f.propFr}. Un tapis si vous en avez un.`,
    stepsEn: (_flavor) => [
      "Ask who needs a drink, the washroom, or a quiet lap.",
      "Do three slow stretches the children choose.",
      "Stop while they are still willing. Rest is part of the plan.",
    ],
    stepsFr: (_flavor) => [
      "Demandez qui a besoin d'un verre, des toilettes ou d'un moment calme.",
      "Faites trois étirements lents choisis par les enfants.",
      "Arrêtez pendant qu'ils sont encore partants. Le repos fait partie du plan.",
    ],
  },
  {
    theme: "play",
    age: "infant",
    titleEn: (f) => `Basket on the floor by ${f.placeEn}`,
    titleFr: () => `Panier au sol`,
    materialsEn: (f) => `${f.propEn}. Nothing smaller than a film canister.`,
    materialsFr: (f) => `${f.propFr}. Rien de plus petit qu'un bouchon large.`,
    stepsEn: (_flavor) => [
      "Put two or three safe objects on a clean mat.",
      "Let the baby reach, mouth, and drop. Stay within arm's length.",
      "Name what they do in a short sentence, then wait.",
    ],
    stepsFr: (_flavor) => [
      "Placez deux ou trois objets sûrs sur un tapis propre.",
      "Laissez le bébé atteindre, porter à la bouche et laisser tomber. Restez à portée de bras.",
      "Nommez ce qu'il fait dans une courte phrase, puis attendez.",
    ],
  },
  {
    theme: "talk",
    age: "preschool",
    titleEn: (f) => `Picture talk about ${f.placeEn}`,
    titleFr: () => `Parler d'une image`,
    materialsEn: (f) => `Paper, crayons, and ${f.propEn}.`,
    materialsFr: (f) => `Du papier, des crayons et ${f.propFr}.`,
    stepsEn: (_flavor) => [
      "A child draws one thing from today.",
      "Ask one open question: what happened next?",
      "Write their words under the drawing. Read them back.",
    ],
    stepsFr: (_flavor) => [
      "Un enfant dessine une chose de la journée.",
      "Posez une question ouverte : qu'est-ce qui s'est passé ensuite?",
      "Écrivez ses mots sous le dessin. Relisez-les.",
    ],
  },
  {
    theme: "care",
    age: "school",
    titleEn: (f) => `Look after ${f.placeEn}`,
    titleFr: () => `Prendre soin de l'endroit`,
    materialsEn: (f) => f.propEn,
    materialsFr: (f) => f.propFr,
    stepsEn: (_flavor) => [
      "Pick one small job: wipe a table, sort the basket, or feed a plant.",
      "Do it together. The child leads one step.",
      "Thank the person who helped, by name.",
    ],
    stepsFr: (_flavor) => [
      "Choisissez une petite tâche : essuyer une table, trier le panier ou arroser une plante.",
      "Faites-la ensemble. L'enfant mène une étape.",
      "Remerciez la personne qui a aidé, par son nom.",
    ],
  },
];

function buildGoals(): CurriculumGoal[] {
  return PROVINCE_CODES.flatMap((province) => {
    const framework = FRAMEWORKS.find((row) => row.province === province);
    return GOAL_THEMES.map((theme) => {
      const line = GOAL_LINES[province][theme];
      return {
        id: `${province}-${theme}`,
        province,
        theme,
        en: line.en,
        fr: line.fr,
        credit: framework?.credit || "",
        sourceUrl: framework?.url || "",
      };
    });
  });
}

function buildDocs(): RequiredDoc[] {
  return PROVINCE_CODES.map((province) => {
    const meta = DOC_META[province];
    const prompts = DOC_PROMPTS[province];
    return { ...meta, province, promptsEn: prompts.en, promptsFr: prompts.fr };
  });
}

function buildActivities(): CurriculumActivity[] {
  const rows: CurriculumActivity[] = [];
  for (const province of PROVINCE_CODES) {
    TEMPLATES.forEach((template, index) => {
      const flavor = FLAVOR[province];
      rows.push({
        id: `act-${province.toLowerCase()}-${index + 1}`,
        province,
        age: template.age,
        theme: template.theme,
        goalId: `${province}-${template.theme}`,
        titleEn: template.titleEn(flavor),
        titleFr: template.titleFr(flavor),
        materialsEn: template.materialsEn(flavor),
        materialsFr: template.materialsFr(flavor),
        stepsEn: template.stepsEn(flavor),
        stepsFr: template.stepsFr(flavor),
      });
    });
  }
  return rows;
}

export const FRAMEWORK_LIBRARY = FRAMEWORKS;
export const GOAL_LIBRARY = buildGoals();
export const REQUIRED_DOCS = buildDocs();
export const ACTIVITY_LIBRARY = buildActivities();

export function frameworkFor(province: ProvinceCode): FrameworkRecord {
  const row = FRAMEWORK_LIBRARY.find((item) => item.province === province);
  if (!row) throw new Error("Unknown province");
  return row;
}

export function goalsFor(province: ProvinceCode): CurriculumGoal[] {
  return GOAL_LIBRARY.filter((goal) => goal.province === province);
}

export function docsFor(province: ProvinceCode): RequiredDoc[] {
  return REQUIRED_DOCS.filter((doc) => doc.province === province);
}

export function activitiesFor(province: ProvinceCode, age?: AgeBand): CurriculumActivity[] {
  return ACTIVITY_LIBRARY.filter((activity) => activity.province === province && (!age || activity.age === age));
}

export function normalizeProvince(raw: string | null | undefined): ProvinceCode | null {
  const value = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "");
  const aliases: Record<string, ProvinceCode> = {
    PEI: "PE",
    NWT: "NT",
    NF: "NL",
    NFDL: "NL",
    QUEBEC: "QC",
    "QUÉBEC": "QC",
  };
  if (aliases[value]) return aliases[value];
  return (PROVINCE_CODES as readonly string[]).includes(value) ? (value as ProvinceCode) : null;
}

export function planLanguage(province: ProvinceCode, locale: string): "en" | "fr" | "both" {
  if (province === "NB") return "both";
  if (province === "QC" || locale === "fr") return "fr";
  return "en";
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

export function weekPlan(province: ProvinceCode, weekStart: string) {
  const goals = goalsFor(province);
  const doc = docsFor(province)[0];
  return {
    province,
    weekStart,
    introEn: doc?.promptsEn[0] || "Plan the week in your own words.",
    introFr: doc?.promptsFr[0] || "Planifiez la semaine dans vos mots.",
    days: WEEKDAYS.map((day, index) => {
      const goal = goals[index % goals.length];
      return {
        day,
        goalId: goal?.id || "",
        promptEn: goal ? `Watch for: ${goal.en}` : "",
        promptFr: goal ? `À observer : ${goal.fr}` : "",
      };
    }),
  };
}

export function monthPlan(province: ProvinceCode, monthStart: string) {
  const goals = goalsFor(province);
  return {
    province,
    monthStart,
    weeks: [1, 2, 3, 4].map((week) => {
      const goal = goals[(week - 1) % goals.length];
      return {
        week,
        goalId: goal?.id || "",
        promptEn: goal ? `Week ${week} focus: ${goal.en}` : "",
        promptFr: goal ? `Semaine ${week} : ${goal.fr}` : "",
      };
    }),
  };
}

export function buildStatement(input: {
  doc: RequiredDoc;
  centreName: string;
  answers: readonly string[];
  goalLabels: readonly string[];
}): { text: string; credit: string; sourceUrl: string } {
  const framework = frameworkFor(input.doc.province);
  const lines = [
    input.centreName.trim() || "Our centre",
    "",
    ...input.doc.promptsEn.map((prompt, index) => `${prompt}\n${(input.answers[index] || "").trim()}`),
    "",
    "Goals we use, in our words:",
    ...input.goalLabels.map((label) => `- ${label}`),
    "",
    framework.credit,
    framework.url,
    input.doc.citation,
  ];
  return { text: lines.join("\n").trim(), credit: framework.credit, sourceUrl: framework.url };
}

export function addOneYear(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return "";
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  return next.toISOString().slice(0, 10);
}

export function reviewReminder(doc: RequiredDoc, savedOn: string) {
  return {
    dueOn: doc.review === "annual" ? addOneYear(savedOn) : "",
    logOnly: true as const,
    sendsMail: false as const,
    sendsSms: false as const,
    reviewStatus: doc.reviewStatus,
    confirmation: doc.confirmation,
  };
}

export type CoverageChild = { id: string; name: string; room: string };
export type CoverageStory = { childId: string; goalIds: readonly string[]; status: "draft" | "published" };

export function coverageReport(input: { province: ProvinceCode; children: readonly CoverageChild[]; stories: readonly CoverageStory[] }) {
  const goals = goalsFor(input.province);
  const perChild = input.children.map((child) => {
    const covered = new Set(
      input.stories
        .filter((story) => story.childId === child.id && story.status === "published")
        .flatMap((story) => story.goalIds),
    );
    return {
      childId: child.id,
      childName: child.name,
      room: child.room || "Unassigned",
      covered: goals.filter((goal) => covered.has(goal.id)).map((goal) => goal.id),
      missing: goals.filter((goal) => !covered.has(goal.id)).map((goal) => goal.id),
    };
  });
  const rooms = new Map<string, typeof perChild>();
  for (const row of perChild) {
    const list = rooms.get(row.room) || [];
    list.push(row);
    rooms.set(row.room, list);
  }
  const perRoom = [...rooms.entries()].map(([room, rows]) => ({
    room,
    childCount: rows.length,
    goals: goals.map((goal) => ({
      goalId: goal.id,
      childrenCovered: rows.filter((row) => row.covered.includes(goal.id)).length,
    })),
  }));
  return { province: input.province, perChild, perRoom };
}

export function anonymiseCoverage(input: { province: ProvinceCode; coveredCounts: readonly { goalId: string; children: number }[]; childCount: number }) {
  return {
    province: input.province,
    childCount: suppressCount(input.childCount),
    goals: input.coveredCounts.map((row) => ({
      goalId: row.goalId,
      children: suppressCount(row.children),
    })),
  };
}

export function homeIdeas(province: ProvinceCode, goalIds: readonly string[], age: AgeBand, limit = 3): CurriculumActivity[] {
  const wanted = new Set(goalIds);
  const rows = activitiesFor(province).filter((activity) => wanted.has(activity.goalId) || activity.age === age);
  const unique: CurriculumActivity[] = [];
  for (const row of rows) {
    if (unique.some((item) => item.id === row.id)) continue;
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function curriculumMode(pack: boolean, live: boolean): "off" | "draft" | "live" {
  if (!pack) return "off";
  if (!live) return "draft";
  return "live";
}

export function parentMaySeeStory(input: { mode: "off" | "draft" | "live"; status: "draft" | "published"; enrolled: boolean; ownsChild: boolean }): boolean {
  return input.mode === "live" && input.status === "published" && input.enrolled && input.ownsChild;
}

export function acceptStoryPhoto(input: { consentAt: string | null; enrolled: boolean; key: string }):
  | { ok: true; key: string }
  | { ok: false; reason: "consent" | "enrol" | "public" | "sample" } {
  if (!input.enrolled) return { ok: false, reason: "enrol" };
  if (!input.consentAt || Number.isNaN(Date.parse(input.consentAt))) return { ok: false, reason: "consent" };
  const key = input.key.trim();
  if (/^https?:/i.test(key) || key.startsWith("data:") || key.startsWith("/img") || key.startsWith("blob:")) {
    return { ok: false, reason: "public" };
  }
  if (/sample|stock|child-face|faces\//i.test(key)) return { ok: false, reason: "sample" };
  if (!key.startsWith("family-docs/curriculum/") || key.includes("..")) return { ok: false, reason: "public" };
  return { ok: true, key };
}

export function photoView(input: { key: string; consentAt: string | null; enrolled: boolean; signedUrl: string | null }):
  | { url: string }
  | { blocked: true; reason: string } {
  const accepted = acceptStoryPhoto({ consentAt: input.consentAt, enrolled: input.enrolled, key: input.key });
  if (!accepted.ok) return { blocked: true, reason: accepted.reason };
  const url = String(input.signedUrl || "");
  if (!url.includes("?")) return { blocked: true, reason: "unsigned" };
  return { url };
}

const LEGACY: Record<ProvinceCode, "hdlh" | "flight" | "elf" | "accueillir"> = {
  ON: "hdlh",
  AB: "flight",
  QC: "accueillir",
  BC: "elf",
  SK: "flight",
  MB: "flight",
  NB: "elf",
  NS: "elf",
  PE: "elf",
  NL: "elf",
  YT: "elf",
  NT: "elf",
  NU: "elf",
};

const LEGACY_DOMAIN: Record<GoalTheme, Record<"hdlh" | "flight" | "elf" | "accueillir", string>> = {
  belong: { hdlh: "belonging", flight: "well-being", elf: "belonging", accueillir: "belonging" },
  well: { hdlh: "well-being", flight: "well-being", elf: "belonging", accueillir: "well-being" },
  play: { hdlh: "engagement", flight: "play", elf: "engagement", accueillir: "exploration" },
  talk: { hdlh: "expression", flight: "communication", elf: "communication", accueillir: "communication" },
  care: { hdlh: "belonging", flight: "diversity", elf: "identities", accueillir: "belonging" },
};

export function legacyStoryFields(province: ProvinceCode, theme: GoalTheme): { framework: "hdlh" | "flight" | "elf" | "accueillir"; domain: string } {
  const framework = LEGACY[province];
  return { framework, domain: LEGACY_DOMAIN[theme][framework] };
}
