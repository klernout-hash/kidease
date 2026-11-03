export type DocusignTemplateOption = {
  templateId: string;
  name: string;
};

export const PACK_KINDS = ["provider_agreement", "enrolment_pack", "parent_enrolment_agreement"] as const;

export type PackKind = (typeof PACK_KINDS)[number];

export const PACK_TITLES: Record<PackKind, { en: string; fr: string }> = {
  provider_agreement: {
    en: "KidEase Licensed Centre Agreement",
    fr: "Entente du centre permis KidEase",
  },
  enrolment_pack: {
    en: "KidEase Enrolment Paperwork Pack",
    fr: "Trousse de documents d’inscription KidEase",
  },
  parent_enrolment_agreement: {
    en: "Enrolment agreement",
    fr: "Entente d’inscription",
  },
};

export function isPackKind(value: unknown): value is PackKind {
  return typeof value === "string" && (PACK_KINDS as readonly string[]).includes(value);
}

export function parsePackKind(value: unknown, fallback: PackKind = "provider_agreement"): PackKind {
  return isPackKind(value) ? value : fallback;
}

export function packTitle(kind: PackKind, locale: "en" | "fr" = "en") {
  return PACK_TITLES[kind][locale];
}

export function defaultTemplateEnvName(kind: PackKind) {
  if (kind === "enrolment_pack") return "DOCUSIGN_TEMPLATE_ENROLMENT_PACK";
  if (kind === "parent_enrolment_agreement") return "DOCUSIGN_TEMPLATE_PARENT_AGREEMENT";
  return "DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT";
}

export function defaultTemplateId(
  kind: PackKind,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = (env[defaultTemplateEnvName(kind)] || "").trim();
  return raw || null;
}

export function templateRoleName(env: Record<string, string | undefined> = process.env) {
  return (env.DOCUSIGN_TEMPLATE_ROLE || "Provider").trim() || "Provider";
}

export function contractPdfKey(daycareId: string, contractId: string) {
  const centre = String(daycareId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "");
  const id = String(contractId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "");
  if (!centre || !id) throw new Error("Contract storage path is missing");
  return `contracts/${centre}/${id}.pdf`;
}

export function signedPdfPath(contractId: string) {
  return `/api/contracts/${encodeURIComponent(contractId)}/pdf`;
}

type CentreFields = {
  centreName: string;
  address?: string;
  city?: string;
  province?: string;
  licence?: string;
  signerName?: string;
  signerEmail?: string;
};

function whereLine(input: CentreFields) {
  return [input.address, input.city, input.province].filter(Boolean).join(", ") || "the listed address";
}

export function centreAgreementBody(input: CentreFields) {
  const where = whereLine(input);
  return `KIDEASE LICENSED CENTRE AGREEMENT / ENTENTE DU CENTRE PERMIS KIDEASE

This agreement is between KidEase (operated from Winnipeg, Manitoba) and the licensed child care centre named below.
La présente entente est conclue entre KidEase (Winnipeg, Manitoba) et le service de garde permis nommé ci-dessous.

Centre: ${input.centreName}
Location / Lieu: ${where}
Licence number / Numéro de permis: ${input.licence || "to be confirmed / à confirmer"}
Authorized signer / Signataire autorisé: ${input.signerName || "Centre operator / Exploitant"}
Signer email / Courriel: ${input.signerEmail || "—"}

1. Listing. The centre asks KidEase to show its listing to parents searching for care. KidEase may approve, pause, or remove a listing if the centre is unlicensed, the licence expires, ratings fall below 3.5 stars with at least three reviews, or the centre breaks these terms.
   Fiche. Le centre demande à KidEase d’afficher sa fiche. KidEase peut approuver, suspendre ou retirer une fiche si le centre n’est pas permis, si le permis expire, si la note descend sous 3,5 étoiles avec au moins trois avis, ou si le centre enfreint ces conditions.

2. Accuracy. The centre will keep name, address, licence, fees, ages, photos, and contact details true. Fake photos or invented licence numbers are grounds for immediate removal.
   Exactitude. Le centre maintient nom, adresse, permis, tarifs, âges, photos et coordonnées exacts. Photos fausses ou numéros inventés : retrait immédiat.

3. Enrolment. Parents request spots through KidEase. The centre decides accept, waitlist, or decline. KidEase does not guarantee enrolment numbers.
   Inscription. Les parents demandent une place dans KidEase. Le centre accepte, met en attente ou refuse. KidEase ne garantit pas le nombre d’inscriptions.

4. Payments and payouts. Payments run on Stripe Connect. The centre accepts the Stripe Connected Account Agreement (https://stripe.com/legal/connect-account). Stripe holds and pays out funds. Disputes and chargebacks are debited from the centre's Stripe balance; the centre may answer them with evidence through the desk. No KidEase fee is charged today. The centre will not ask parents to bypass KidEase payment for spots that started on the platform.
   Paiements et versements. Les paiements passent par Stripe Connect. Le centre accepte l'Entente de compte connecté Stripe (https://stripe.com/legal/connect-account). Stripe détient et verse les fonds. Les litiges et rétrofacturations sont débités du solde Stripe du centre, qui peut y répondre avec des preuves par le bureau. Aucun frais KidEase aujourd'hui. Le centre ne contourne pas KidEase pour les places commencées sur la plateforme.

5. Messages. After a parent requests a spot, the parent and the centre share one in-app thread. The centre will answer in a reasonable time during operating hours.
   Messages. Après une demande, un fil dans l’appli relie le parent et le centre. Le centre répond dans un délai raisonnable pendant les heures d’ouverture.

6. Privacy. The centre is responsible for its enrolment records, incident reports, photos, and attendance kept in KidEase; KidEase processes them only as the centre's service provider. Child photos are shared only with guardians who opted in. Home daycare street addresses are never published. Suspected breaches are reported to privacy@kidease.ca within 24 hours.
   Vie privée. Le centre est responsable de ses dossiers d’inscription, rapports d’incident, photos et présences tenus dans KidEase; KidEase les traite seulement comme fournisseur de services du centre. Les photos d’enfants ne sont partagées qu’avec les tuteurs ayant consenti. L’adresse d’un milieu familial n’est jamais publiée. Tout incident soupçonné est signalé à privacy@kidease.ca dans les 24 heures.

7. Price. The tools are free today. If paid plans launch, KidEase gives 30 days notice, nothing is billed without the centre's opt-in, and a centre that signed before launch keeps the founding discount shown on its desk while its account is active.
   Prix. Les outils sont gratuits aujourd’hui. Si des forfaits payants sont lancés, KidEase donne 30 jours de préavis, rien n’est facturé sans l’adhésion du centre, et un centre ayant signé avant le lancement conserve le rabais fondateur affiché tant que son compte est actif.

8. Provider Terms. The KidEase Provider Terms (https://kidease.ca/provider-terms) form part of this agreement. If they conflict, this signed agreement wins on that point. KidEase gives 30 days notice of changes.
   Conditions des fournisseurs. Les Conditions des fournisseurs KidEase (https://kidease.ca/provider-terms) font partie de la présente entente. En cas de conflit, l’entente signée prévaut sur ce point. KidEase donne 30 jours de préavis de toute modification.

9. Term. Either side may end this agreement with 30 days written notice. KidEase may end it immediately for licence, safety, or fraud issues. The centre may export its records for 90 days after it ends.
   Durée. Chaque partie peut y mettre fin avec un préavis écrit de 30 jours. KidEase peut y mettre fin immédiatement pour permis, sécurité ou fraude. Le centre peut exporter ses registres pendant 90 jours après la fin.

10. No endorsement. KidEase is an independent private service, not a government service, and is not endorsed by any ministry or licensing office. Neither side will claim otherwise.
   Aucune approbation. KidEase est un service privé indépendant, non gouvernemental, et n’est approuvé par aucun ministère ni bureau des permis. Aucune partie ne prétendra le contraire.

11. Liability. To the extent the law allows, KidEase's total liability is limited to fees paid to KidEase in the prior 12 months (or $100). KidEase does not supervise children.
   Responsabilité. Dans la mesure permise par la loi, la responsabilité totale de KidEase se limite aux frais payés à KidEase dans les 12 mois précédents (ou 100 $). KidEase ne surveille pas d’enfants.

12. Law and language. This agreement is governed by the laws of Manitoba and Canada. The parties chose to sign it in English and French; both versions are equally authoritative. Les parties ont exigé que la présente entente soit rédigée en français et en anglais.
   Droit et langue. Les lois du Manitoba et du Canada s’appliquent. Les deux versions font également foi.

By signing in DocuSign, the signer confirms they can bind the centre.
En signant dans DocuSign, le signataire confirme qu’il peut lier le centre.

KidEase operator / Exploitant: Kyle Lernout · kyle@kidease.ca
`;
}

export function enrolmentPackBody(input: CentreFields) {
  const where = whereLine(input);
  return `KIDEASE ENROLMENT PAPERWORK PACK / TROUSSE D’INSCRIPTION KIDEASE

The licensed centre named below will use KidEase enrolment tools (parent requests, child profiles, and in-app messages) only as described here.
Le centre permis nommé ci-dessous utilisera les outils d’inscription KidEase (demandes des parents, profils d’enfants et messages) seulement comme décrit ici.

Centre: ${input.centreName}
Location / Lieu: ${where}
Licence number / Numéro de permis: ${input.licence || "to be confirmed / à confirmer"}
Authorized signer / Signataire autorisé: ${input.signerName || "Centre operator / Exploitant"}
Signer email / Courriel: ${input.signerEmail || "—"}

1. Requests. Parents send inquire, tour, and spot requests through KidEase. The centre records accept, waitlist, or decline in the daycare desk.
   Demandes. Les parents envoient les demandes dans KidEase. Le centre consigne acceptation, attente ou refus au bureau de la garderie.

2. Child profiles. Details a parent shares (name, birthdate, allergies, medications, emergency and pickup people) are used only to place and care for that child at this centre.
   Profils. Les détails partagés par le parent servent seulement à placer et soigner cet enfant dans ce centre.

3. Paperwork. When KidEase sends a DocuSign enrolment pack, the signed PDF is stored on the centre’s KidEase profile for the operator and KidEase admin to review. It is not a public listing photo.
   Documents. La copie PDF signée est déposée sur le profil KidEase du centre pour l’exploitant et l’admin. Ce n’est pas une photo publique de la fiche.

4. Privacy. Staff who can open the daycare desk may see signed packs for this centre. Do not download them onto shared or personal devices that are not needed for care.
   Vie privée. Le personnel qui ouvre le bureau de la garderie peut voir les trousses signées de ce centre. Ne les téléchargez pas sur un appareil inutile à la garde.

5. Retention. KidEase keeps the signed copy while the listing is claimed, then follows the privacy notice on kidease.ca.
   Conservation. KidEase conserve la copie signée tant que la fiche est réclamée, puis suit l’avis de confidentialité.

By signing in DocuSign, the signer confirms they can bind the centre for enrolment paperwork.
En signant dans DocuSign, le signataire confirme qu’il peut lier le centre pour les documents d’inscription.

KidEase operator / Exploitant: Kyle Lernout · kyle@kidease.ca
`;
}

export function packDocumentBody(kind: PackKind, input: CentreFields) {
  if (kind === "parent_enrolment_agreement") {
    return "Enrolment agreement between the parent and the centre. The terms stay on the child’s file.";
  }
  return kind === "enrolment_pack" ? enrolmentPackBody(input) : centreAgreementBody(input);
}

export function packEmailSubject(kind: PackKind, centreName: string) {
  if (kind === "parent_enrolment_agreement") {
    return `Please sign: Enrolment agreement: ${centreName}`;
  }
  const title = packTitle(kind, "en");
  return `Please sign: ${title}: ${centreName}`;
}

export function packEmailBlurb(kind: PackKind) {
  if (kind === "parent_enrolment_agreement") {
    return "Please sign the enrolment agreement between your family and the centre. / Veuillez signer l’entente d’inscription entre votre famille et le centre.";
  }
  return kind === "enrolment_pack"
    ? "KidEase needs the enrolment paperwork pack signed so parent requests and child profiles can stay on this centre’s desk. / KidEase a besoin de la trousse d’inscription signée."
    : "KidEase needs the licensed centre agreement signed before the listing stays live for parent requests. / KidEase a besoin de l’entente du centre permis signée.";
}
