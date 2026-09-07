export type DocusignTemplateOption = {
  templateId: string;
  name: string;
};

export const PACK_KINDS = ["provider_agreement", "enrolment_pack"] as const;

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
};

export function isPackKind(value: unknown): value is PackKind {
  return value === "provider_agreement" || value === "enrolment_pack";
}

export function parsePackKind(value: unknown, fallback: PackKind = "provider_agreement"): PackKind {
  return isPackKind(value) ? value : fallback;
}

export function packTitle(kind: PackKind, locale: "en" | "fr" = "en") {
  return PACK_TITLES[kind][locale];
}

export function defaultTemplateEnvName(kind: PackKind) {
  return kind === "enrolment_pack"
    ? "DOCUSIGN_TEMPLATE_ENROLMENT_PACK"
    : "DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT";
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

This agreement is between KidEase (operated from Winnipeg, Manitoba) and the licensed childcare centre named below.
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

4. Fees. Parent payments and centre payouts follow the KidEase ledger and posted platform fee. The centre will not ask parents to bypass KidEase payment for spots that started on the platform.
   Frais. Les paiements suivent le registre KidEase et les frais de plateforme affichés. Le centre ne contourne pas KidEase pour les places commencées sur la plateforme.

5. Messages. After a parent requests a spot, the parent and the centre share one in-app thread. The centre will answer in a reasonable time during operating hours.
   Messages. Après une demande, un fil dans l’appli relie le parent et le centre. Le centre répond dans un délai raisonnable pendant les heures d’ouverture.

6. Privacy. Child profiles and parent messages stay inside KidEase tools and are used only to place and care for that child.
   Vie privée. Les profils d’enfants et les messages restent dans KidEase et servent seulement à placer et soigner cet enfant.

7. Term. Either side may end this agreement with 14 days written notice. KidEase may end it immediately for licence, safety, or fraud issues.
   Durée. Chaque partie peut y mettre fin avec un préavis écrit de 14 jours. KidEase peut y mettre fin immédiatement pour permis, sécurité ou fraude.

8. Law. This agreement is governed by the laws of Manitoba, Canada.
   Droit. Les lois du Manitoba (Canada) s’appliquent.

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
  return kind === "enrolment_pack" ? enrolmentPackBody(input) : centreAgreementBody(input);
}

export function packEmailSubject(kind: PackKind, centreName: string) {
  const title = packTitle(kind, "en");
  return `Please sign: ${title} — ${centreName}`;
}

export function packEmailBlurb(kind: PackKind) {
  return kind === "enrolment_pack"
    ? "KidEase needs the enrolment paperwork pack signed so parent requests and child profiles can stay on this centre’s desk. / KidEase a besoin de la trousse d’inscription signée."
    : "KidEase needs the licensed centre agreement signed before the listing stays live for parent requests. / KidEase a besoin de l’entente du centre permis signée.";
}
