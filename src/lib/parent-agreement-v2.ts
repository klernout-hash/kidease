/**
 * Enrolment agreement v2: KidEase-branded, bilingual (EN/FR side by side).
 * KidEase delivers the document only. The centre's own terms bind the parties.
 * Quebec centres get French first by default (Charter of the French Language s.55).
 * Home daycare street addresses are never printed.
 * Not legal advice: a lawyer must review before real families sign.
 */
import { AGREEMENT_LOGO_DATA_URI } from "./agreement-logo.ts";
import { provinceInfo, type ProvinceCode } from "./gov/places.ts";
import {
  escapeHtml,
  feePeriodLabel,
  isStartDate,
  lawClause,
  provinceCodeFromStored,
  termsReady,
  type AgreementParties,
  type AgreementTerms,
} from "./parent-agreement.ts";

export const AGREEMENT_TEMPLATE_VERSION = "enrolment-v2-2026-11";

/** Turn on with AGREEMENT_TEMPLATE=v2. Default stays v1. */
export function agreementTemplateV2(env: Record<string, string | undefined> = process.env) {
  return String(env.AGREEMENT_TEMPLATE || "").trim().toLowerCase() === "v2";
}

export type Bi = { en: string; fr: string };

/** Centre-editable extras. Every field falls back to a neutral default. */
export type AgreementExtras = {
  baseFee?: Bi;
  reducedFee?: Bi;
  billingCycle?: Bi;
  paymentMethod?: Bi;
  refund?: Bi;
  feeIncrease?: Bi;
  missedPayment?: Bi;
  absences?: Bi;
  closures?: Bi;
  terminationByCentre?: Bi;
  behaviour?: Bi;
  handbook?: Bi;
  disputeContact?: Bi;
  licensingOffice?: Bi;
};

export type Guardian = { name: string; email?: string; relationship?: string };

export type AgreementV2Parties = AgreementParties & {
  isHomeDaycare: boolean;
  guardians?: Guardian[];
  contractLanguage?: "en" | "fr";
  quebecSubsidized?: boolean;
};

/** DocuSign anchor strings. Rendered in white 1px text in the document. */
export function guardianAnchors(index: number) {
  const n = index + 1;
  return { sign: `/pg${n}sig/`, initial: `/pg${n}ini/`, date: `/pg${n}date/` };
}
export const DIRECTOR_ANCHORS = { sign: "/dirsig/", initial: "/dirini/", date: "/dirdate/" } as const;

type ProvinceNote = { program: Bi; extra?: Bi };

/** Per-jurisdiction notes. Descriptive only; never a claim of endorsement. */
export const PROVINCE_NOTES: Record<ProvinceCode, ProvinceNote> = {
  BC: { program: { en: "If the centre takes part in British Columbia's Child Care Fee Reduction Initiative (CCFRI) or $10 a Day ChildCareBC, the reduction is shown in section 5.", fr: "Si le centre participe à l’Initiative de réduction des frais de garde (CCFRI) ou au programme 10 $ par jour de la Colombie-Britannique, la réduction figure à l’article 5." } },
  AB: { program: { en: "If the centre receives Alberta's affordability grant, the grant amount and the parent fee are shown in section 5.", fr: "Si le centre reçoit la subvention d’abordabilité de l’Alberta, le montant et les frais parentaux figurent à l’article 5." } },
  SK: { program: { en: "If the space is in Saskatchewan's regulated child care program, the reduced parent fee is shown in section 5.", fr: "Si la place fait partie du programme réglementé de la Saskatchewan, les frais réduits figurent à l’article 5." } },
  MB: { program: { en: "If the space is funded under Manitoba's $10-a-day program, the maximum parent fee is shown in section 5.", fr: "Si la place est financée par le programme à 10 $ par jour du Manitoba, les frais maximums figurent à l’article 5." } },
  ON: { program: { en: "If the centre is enrolled in the Canada-Wide Early Learning and Child Care (CWELCC) system in Ontario, the base fee before reduction and the reduced fee are both shown in section 5. The centre's parent handbook is required under Ontario Regulation 137/15.", fr: "Si le centre participe au système pancanadien d’apprentissage et de garde des jeunes enfants (APGJE) en Ontario, les frais de base avant réduction et les frais réduits figurent à l’article 5. Le manuel des parents du centre est exigé par le Règlement de l’Ontario 137/15." } },
  QC: {
    program: { en: "For a reduced-contribution (subsidized) place in Quebec, the services agreement on the Ministère de la Famille form governs the place. This document adds to it and never replaces it.", fr: "Pour une place à contribution réduite (subventionnée) au Québec, l’entente de services sur le formulaire du ministère de la Famille régit la place. Le présent document s’y ajoute et ne la remplace jamais." },
  },
  NB: { program: { en: "If the centre is a New Brunswick Early Learning Centre, the parent fee follows the provincial fee schedule shown in section 5.", fr: "Si le centre est un Centre de la petite enfance du Nouveau-Brunswick, les frais suivent la grille provinciale indiquée à l’article 5." } },
  NS: { program: { en: "If the space is in Nova Scotia's licensed fee-reduction program, the reduced fee is shown in section 5.", fr: "Si la place fait partie du programme de réduction des frais de la Nouvelle-Écosse, les frais réduits figurent à l’article 5." } },
  PE: { program: { en: "If the centre is a Prince Edward Island Early Years Centre, the parent fee follows the provincial schedule shown in section 5.", fr: "Si le centre est un Centre de la petite enfance de l’Île-du-Prince-Édouard, les frais suivent la grille provinciale indiquée à l’article 5." } },
  NL: { program: { en: "If the centre takes part in Newfoundland and Labrador's $10-a-day operating grant, the parent fee is shown in section 5.", fr: "Si le centre participe à la subvention à 10 $ par jour de Terre-Neuve-et-Labrador, les frais figurent à l’article 5." } },
  YT: { program: { en: "If the centre takes part in Yukon's universal child care program, the parent fee is shown in section 5.", fr: "Si le centre participe au programme universel de garde du Yukon, les frais figurent à l’article 5." } },
  NT: { program: { en: "If the centre receives Northwest Territories fee-reduction funding, the reduced fee is shown in section 5.", fr: "Si le centre reçoit le financement de réduction des frais des Territoires du Nord-Ouest, les frais réduits figurent à l’article 5." } },
  NU: { program: { en: "If the centre receives Nunavut fee-reduction funding, the reduced fee is shown in section 5.", fr: "Si le centre reçoit le financement de réduction des frais du Nunavut, les frais réduits figurent à l’article 5." } },
};

function d(value: Bi | undefined, fallback: Bi): Bi {
  return { en: value?.en?.trim() || fallback.en, fr: value?.fr?.trim() || fallback.fr };
}

const DEFAULTS: Required<AgreementExtras> = {
  baseFee: { en: "As written in the fee line above.", fr: "Comme indiqué à la ligne des frais ci-dessus." },
  reducedFee: { en: "No government fee reduction applies to this space.", fr: "Aucune réduction gouvernementale ne s’applique à cette place." },
  billingCycle: { en: "Billed monthly in advance on the 1st of each month.", fr: "Facturé mensuellement à l’avance le 1er de chaque mois." },
  paymentMethod: { en: "Payment through KidEase Pay (card or pre-authorized debit), or another method the centre accepts in writing.", fr: "Paiement par KidEase Pay (carte ou débit préautorisé), ou une autre méthode acceptée par écrit par le centre." },
  refund: { en: "The deposit is applied to the last period of care, or refunded within 30 days if the centre cannot start care.", fr: "Le dépôt est appliqué à la dernière période de garde, ou remboursé dans les 30 jours si le centre ne peut pas commencer la garde." },
  feeIncrease: { en: "The centre gives at least 30 days of written notice before any fee increase, within the limits of any provincial program.", fr: "Le centre donne un préavis écrit d’au moins 30 jours avant toute hausse des frais, dans les limites de tout programme provincial." },
  missedPayment: { en: "A returned or missed payment is due within 7 days. The centre may charge its returned-payment fee, and may suspend care after written notice.", fr: "Un paiement refusé ou manqué est dû dans les 7 jours. Le centre peut facturer ses frais de paiement refusé et suspendre la garde après un avis écrit." },
  absences: { en: "Fees are owed for days the child is absent, including sick days and family holidays, unless the centre's policy says otherwise.", fr: "Les frais sont dus pour les jours d’absence, y compris les jours de maladie et les vacances, sauf indication contraire dans la politique du centre." },
  closures: { en: "For an emergency closure (weather, utility failure, public health order), the centre explains in writing how fees are treated.", fr: "En cas de fermeture d’urgence (météo, panne, ordonnance de santé publique), le centre explique par écrit le traitement des frais." },
  terminationByCentre: { en: "The centre may end this agreement with written notice for non-payment, repeated breach of its policies, or when it cannot safely meet the child's needs. It gives the same notice period as the family, except where safety requires sooner.", fr: "Le centre peut mettre fin à l’entente par avis écrit en cas de non-paiement, de manquements répétés à ses politiques, ou s’il ne peut répondre en sécurité aux besoins de l’enfant. Il donne le même préavis que la famille, sauf si la sécurité exige plus tôt." },
  behaviour: { en: "The centre follows its written behaviour guidance policy. Physical punishment, harsh or degrading treatment, and withholding food are never used.", fr: "Le centre suit sa politique écrite d’orientation du comportement. Les punitions corporelles, les traitements durs ou dégradants et la privation de nourriture ne sont jamais utilisés." },
  handbook: { en: "The centre's parent handbook and policies form part of this agreement.", fr: "Le manuel des parents et les politiques du centre font partie de la présente entente." },
  disputeContact: { en: "Raise any concern first with the centre director, in writing.", fr: "Adressez d’abord toute préoccupation par écrit à la direction du centre." },
  licensingOffice: { en: "The provincial or territorial child care licensing office for the centre's area.", fr: "Le bureau provincial ou territorial de délivrance des permis de garde de la région du centre." },
};

function rowHtml(n: string, title: Bi, body: Bi, frFirst: boolean, extraHtml = "") {
  const en = `<td class="col" lang="en"><p>${body.en}</p></td>`;
  const fr = `<td class="col" lang="fr"><p>${body.fr}</p></td>`;
  const heading = frFirst ? `${title.fr} / ${title.en}` : `${title.en} / ${title.fr}`;
  return `<section class="sec"><h3><span class="num">${n}</span>${escapeHtml(heading)}</h3><table class="bi"><tr>${frFirst ? fr + en : en + fr}</tr></table>${extraHtml}</section>`;
}

const e = (value: string) => escapeHtml(value);
const eb = (value: Bi): Bi => ({ en: e(value.en), fr: e(value.fr) });
function anchor(text: string) {
  return `<span class="anchor">${e(text)}</span>`;
}

export function parentAgreementDocumentV2(terms: AgreementTerms, parties: AgreementV2Parties, extras: AgreementExtras = {}) {
  const law = lawClause(parties.provinceCode);
  const code = provinceCodeFromStored(parties.provinceCode);
  if (!law || !code) throw new Error("agreement:province_required");
  const ready = termsReady(terms);
  if (ready) throw new Error(`agreement:${ready}`);
  const start = parties.startDate.trim() || terms.startDate;
  if (!isStartDate(start)) throw new Error("agreement:start_required");
  const province = provinceInfo(code)!;
  const isQc = code === "QC";
  const lang = parties.contractLanguage || (isQc ? "fr" : "en");
  const frFirst = lang === "fr";
  const x = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, eb(d((extras as Record<string, Bi>)[k], v))])) as Required<AgreementExtras>;
  const guardians: Guardian[] = (parties.guardians?.length ? parties.guardians : [{ name: parties.parentName }]).slice(0, 4);
  // Home daycare: city and province only. Never the street.
  const where = [parties.isHomeDaycare ? "" : parties.address, parties.city, province.nameEn].filter(Boolean).join(", ");
  const daysEn = parties.daysEn?.trim() || terms.daysEn;
  const daysFr = parties.daysFr?.trim() || terms.daysFr;
  const feeEn = `${terms.feeEn} / ${feePeriodLabel(terms.feePeriod, "en")}`;
  const feeFr = `${terms.feeFr} / ${feePeriodLabel(terms.feePeriod, "fr")}`;
  const note = PROVINCE_NOTES[code];
  let i = 0;
  const n = () => String(++i);
  const R = (title: Bi, body: Bi, extra = "") => rowHtml(n(), title, body, frFirst, extra);
  const initials = () =>
    `<p class="ini">${guardians.map((_, g) => `Initials ${anchor(guardianAnchors(g).initial)}<span class="line short"></span>`).join(" ")} Centre ${anchor(DIRECTOR_ANCHORS.initial)}<span class="line short"></span></p>`;
  const guardianRows = guardians
    .map((g, idx) => `<tr><td>${frFirst ? "Parent ou tuteur" : "Parent or guardian"} ${idx + 1}</td><td>${e(g.name)}${g.relationship ? ` (${e(g.relationship)})` : ""}</td></tr>`)
    .join("");
  const clauses = terms.clauses
    .map((c) => R({ en: c.en.split(/[.:]/)[0].slice(0, 60) || "Centre term", fr: c.fr.split(/[.:]/)[0].slice(0, 60) || "Clause du centre" }, eb({ en: c.en || c.fr, fr: c.fr || c.en })))
    .join("");

  const sections = [
    R({ en: "Parties and child", fr: "Parties et enfant" }, {
      en: `This agreement is between the parent(s) or guardian(s) named above and ${e(parties.centreName)} (the "centre"). KidEase is not a party.`,
      fr: `La présente entente est conclue entre le ou les parents ou tuteurs nommés ci-dessus et ${e(parties.centreName)} (le « centre »). KidEase n’est pas une partie.`,
    }),
    R({ en: "Guardians, custody and court orders", fr: "Tuteurs, garde et ordonnances" }, {
      en: "Every parent or guardian with decision-making authority signs this agreement. The family gives the centre a copy of any custody order, parenting plan or restraining order, and tells the centre in writing of any change. The centre follows the most recent order it holds.",
      fr: "Chaque parent ou tuteur ayant l’autorité décisionnelle signe la présente entente. La famille remet au centre une copie de toute ordonnance de garde, plan parental ou ordonnance de non-communication, et l’avise par écrit de tout changement. Le centre suit l’ordonnance la plus récente qu’il détient.",
    }),
    R({ en: "Hours, days and start date", fr: "Heures, jours et date de début" }, {
      en: `${e(terms.hoursEn)}<br>Days: ${e(daysEn)}<br>Start date: <b>${e(start)}</b>`,
      fr: `${e(terms.hoursFr)}<br>Jours : ${e(daysFr)}<br>Date de début : <b>${e(start)}</b>`,
    }),
    R({ en: "Fees, billing and payment", fr: "Frais, facturation et paiement" }, {
      en: `<b>${e(feeEn)}</b><br>${x.billingCycle.en}<br>${x.paymentMethod.en}<br>Deposit: ${e(terms.depositEn)} ${x.refund.en}<br>Fee increases: ${x.feeIncrease.en}<br>Missed payments: ${x.missedPayment.en}<br><i>This fee appears only in this agreement. It is not a public listing price.</i>`,
      fr: `<b>${e(feeFr)}</b><br>${x.billingCycle.fr}<br>${x.paymentMethod.fr}<br>Dépôt : ${e(terms.depositFr)} ${x.refund.fr}<br>Hausses : ${x.feeIncrease.fr}<br>Paiements manqués : ${x.missedPayment.fr}<br><i>Ces frais figurent seulement dans cette entente. Ce n’est pas un tarif public.</i>`,
    }),
    R({ en: "Government fee reduction", fr: "Réduction gouvernementale des frais" }, {
      en: `Base fee before reduction: ${x.baseFee.en}<br>Fee after reduction: ${x.reducedFee.en}<br>${e(note.program.en)}`,
      fr: `Frais de base avant réduction : ${x.baseFee.fr}<br>Frais après réduction : ${x.reducedFee.fr}<br>${e(note.program.fr)}`,
    }, isQc && parties.quebecSubsidized ? `<p class="callout">Entente de services du Ministère jointe / Ministère services agreement attached: ${anchor("/qcmfa/")}<span class="line"></span></p>` : ""),
    R({ en: "Late pickup", fr: "Départ en retard" }, eb({ en: terms.lateEn, fr: terms.lateFr })),
    R({ en: "Absences, holidays and closures", fr: "Absences, congés et fermetures" }, {
      en: `${x.absences.en}<br>${e(terms.holidaysEn)}<br>${x.closures.en}`,
      fr: `${x.absences.fr}<br>${e(terms.holidaysFr)}<br>${x.closures.fr}`,
    }),
    R({ en: "Notice to withdraw and termination", fr: "Préavis de retrait et résiliation" }, {
      en: `${e(terms.noticeEn)}<br>${x.terminationByCentre.en}`,
      fr: `${e(terms.noticeFr)}<br>${x.terminationByCentre.fr}`,
    }, initials()),
    R({ en: "Authorized pickup", fr: "Personnes autorisées" }, {
      en: "Only the guardians and the adults on the child's authorized pickup list in KidEase may pick up the child. Staff may ask for photo ID. The centre will not release the child to anyone who appears impaired, and will call the guardians.",
      fr: "Seuls les tuteurs et les adultes inscrits à la liste de personnes autorisées dans KidEase peuvent venir chercher l’enfant. Le personnel peut demander une pièce d’identité. Le centre ne remet pas l’enfant à une personne qui semble avoir les facultés affaiblies et appelle les tuteurs.",
    }),
    R({ en: "Emergency contacts", fr: "Personnes à joindre en cas d’urgence" }, {
      en: "The family keeps at least two emergency contacts up to date in KidEase. The centre calls them if a guardian cannot be reached.",
      fr: "La famille tient à jour au moins deux personnes à joindre en cas d’urgence dans KidEase. Le centre les appelle s’il ne peut joindre un tuteur.",
    }),
    R({ en: "Health, allergies and medication", fr: "Santé, allergies et médicaments" }, {
      en: "The family lists allergies, conditions and dietary needs in the child's profile. Staff give medication only with a signed, dated authorization that names the drug, dose and times, in its original labelled container. Sunscreen and insect repellent are applied only with the consent recorded in KidEase.",
      fr: "La famille indique les allergies, conditions et besoins alimentaires dans le profil de l’enfant. Le personnel donne un médicament seulement avec une autorisation signée et datée précisant le médicament, la dose et l’heure, dans son contenant d’origine étiqueté. La crème solaire et le chasse-moustiques sont appliqués seulement avec le consentement enregistré dans KidEase.",
    }),
    R({ en: "Immunization", fr: "Vaccination" }, {
      en: `The family gives the centre the child's immunization record, or a valid exemption, as required in ${e(province.nameEn)}.`,
      fr: `La famille remet au centre le carnet de vaccination de l’enfant, ou une exemption valide, selon les exigences de ${e(province.nameFr)}.`,
    }),
    R({ en: "Sick child", fr: "Enfant malade" }, eb({ en: terms.sickEn, fr: terms.sickFr })),
    R({ en: "Emergency medical treatment", fr: "Soins médicaux d’urgence" }, {
      en: "If the child needs urgent care, the guardians consent to the centre calling 911 and to emergency treatment by qualified health professionals. The centre tries to reach the guardians right away. Ambulance costs are the family's.",
      fr: "Si l’enfant a besoin de soins urgents, les tuteurs consentent à ce que le centre compose le 911 et à des soins d’urgence par des professionnels qualifiés. Le centre tente de joindre les tuteurs immédiatement. Les frais d’ambulance sont à la charge de la famille.",
    }),
    R({ en: "Incidents and serious occurrences", fr: "Incidents et événements graves" }, {
      en: "The centre tells the guardians the same day about any injury or incident, records it, and reports serious occurrences to the licensing office as the law requires.",
      fr: "Le centre informe les tuteurs le jour même de toute blessure ou de tout incident, le consigne et signale les événements graves au bureau des permis comme l’exige la loi.",
    }),
    R({ en: "Outdoor play, field trips and transport", fr: "Jeux extérieurs, sorties et transport" }, {
      en: "Outdoor play is part of the daily program. The centre asks for separate written consent before each field trip or any transport, and never transports a child without it.",
      fr: "Les jeux extérieurs font partie du programme quotidien. Le centre demande un consentement écrit distinct avant chaque sortie ou tout transport, et ne transporte jamais un enfant sans ce consentement.",
    }),
    R({ en: "Behaviour guidance", fr: "Orientation du comportement" }, x.behaviour),
    R({ en: "Parent handbook and policies", fr: "Manuel des parents et politiques" }, {
      en: `${x.handbook.en} The guardians confirm they have received and read it.`,
      fr: `${x.handbook.fr} Les tuteurs confirment l’avoir reçu et lu.`,
    }, initials()),
    R({ en: "Photos and media (separate opt-in)", fr: "Photos et médias (consentement distinct)" }, {
      en: "Photo consent is not a condition of care. It is given or refused separately in KidEase, per child, and can be withdrawn at any time. Photos are shared only with the child's own guardians in the private feed. KidEase never publishes children's faces.",
      fr: "Le consentement aux photos n’est pas une condition de la garde. Il est donné ou refusé séparément dans KidEase, pour chaque enfant, et peut être retiré en tout temps. Les photos sont partagées seulement avec les tuteurs de l’enfant dans le fil privé. KidEase ne publie jamais le visage d’un enfant.",
    }),
    R({ en: "Privacy and information sharing", fr: "Vie privée et communication de renseignements" }, {
      en: `The centre collects only what it needs to care for the child, under PIPEDA${isQc ? " and Quebec's Law 25" : " and Quebec's Law 25 where it applies"}. The centre may share records with the licensing office during an inspection or when the law requires, and with child protection services where the law requires a report. KidEase hosts the records for the centre. Privacy officer: <b>privacy@kidease.ca</b>.`,
      fr: `Le centre recueille seulement ce dont il a besoin pour prendre soin de l’enfant, en vertu de la LPRPDE${isQc ? " et de la Loi 25 du Québec" : " et de la Loi 25 du Québec lorsqu’elle s’applique"}. Le centre peut communiquer des dossiers au bureau des permis lors d’une inspection ou lorsque la loi l’exige, et aux services de protection de l’enfance lorsque la loi exige un signalement. KidEase héberge les dossiers pour le centre. Responsable de la protection des renseignements : <b>privacy@kidease.ca</b>.`,
    }),
    R({ en: "Licensing notice and concerns", fr: "Avis de permis et préoccupations" }, {
      en: `The centre holds licence ${e(parties.licence || "—")} in ${e(province.nameEn)}. ${x.disputeContact.en} Licensing office: ${x.licensingOffice.en}. ${e(law.en)}`,
      fr: `Le centre détient le permis ${e(parties.licence || "—")} en ${e(province.nameFr)}. ${x.disputeContact.fr} Bureau des permis : ${x.licensingOffice.fr}. ${e(law.fr)}`,
    }),
    clauses,
    R({ en: "Role of KidEase", fr: "Rôle de KidEase" }, {
      en: "KidEase only delivers this document for signature and stores the signed copy. The centre's own terms bind the centre and the family. Nothing here is legal advice, and no government has endorsed this document.",
      fr: "KidEase ne fait qu’envoyer ce document pour signature et conserver la copie signée. Les conditions du centre lient le centre et la famille. Rien ici ne constitue un avis juridique, et aucun gouvernement n’a approuvé ce document.",
    }),
    R({ en: "Language of this agreement", fr: "Langue de la présente entente" }, {
      en: `${isQc ? "The French version was presented first. " : ""}The parties chose to sign in <b>${lang === "fr" ? "French" : "English"}</b>. Both versions are provided; the chosen version governs.`,
      fr: `${isQc ? "La version française a été présentée en premier. " : ""}Les parties ont choisi de signer en <b>${lang === "fr" ? "français" : "anglais"}</b>. Les deux versions sont fournies; la version choisie prévaut.`,
    }),
    R({ en: "Electronic signature consent", fr: "Consentement à la signature électronique" }, {
      en: "Each signer agrees to receive and sign this agreement electronically through DocuSign and accepts DocuSign's Electronic Record and Signature Disclosure. Any signer may ask the centre for a paper copy at no charge, and may withdraw consent to electronic records by writing to the centre; this does not undo signatures already given.",
      fr: "Chaque signataire accepte de recevoir et de signer la présente entente électroniquement par DocuSign et accepte la Divulgation relative aux documents et signatures électroniques de DocuSign. Tout signataire peut demander au centre une copie papier sans frais et retirer son consentement aux documents électroniques par écrit au centre; cela n’annule pas les signatures déjà données.",
    }),
  ].join("");

  const sigBlocks = [
    ...guardians.map((g, idx) => {
      const a = guardianAnchors(idx);
      return `<div class="sig"><div class="who">${e(g.name)}</div><div class="role">Parent or guardian ${idx + 1} / Parent ou tuteur ${idx + 1}</div><div class="line">${anchor(a.sign)}</div><div class="cap">Signature</div><div class="line short">${anchor(a.date)}</div><div class="cap">Date</div></div>`;
    }),
    `<div class="sig"><div class="who">${e(parties.directorName)}</div><div class="role">Centre director / Direction du centre — ${e(parties.centreName)}</div><div class="line">${anchor(DIRECTOR_ANCHORS.sign)}</div><div class="cap">Signature</div><div class="line short">${anchor(DIRECTOR_ANCHORS.date)}</div><div class="cap">Date</div></div>`,
  ].join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${frFirst ? "Entente d’inscription / Enrolment agreement" : "Enrolment agreement / Entente d’inscription"}</title>
<style>
@page { size: Letter; margin: 18mm 16mm 20mm; @bottom-center { content: "Page " counter(page) " / " counter(pages); font: 9px Helvetica, Arial, sans-serif; color: #5c6578; } @bottom-left { content: "${AGREEMENT_TEMPLATE_VERSION}"; font: 8px Helvetica, Arial, sans-serif; color: #9aa3b5; } }
body { font-family: Helvetica, Arial, sans-serif; color: #1c2438; font-size: 10.5px; line-height: 1.45; margin: 0; }
.hdr { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #1a3790; padding-bottom: 10px; }
.hdr img { height: 54px; }
.hdr .brand { color: #1a3790; font-weight: 700; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.hdr h1 { margin: 2px 0 0; font-size: 20px; color: #1c2438; }
.hdr .sub { color: #5c6578; font-size: 11px; }
.card { background: #eef2fb; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
.card table { width: 100%; border-collapse: collapse; }
.card td { padding: 2px 6px 2px 0; vertical-align: top; }
.card td:first-child { color: #5c6578; width: 34%; }
.sec { page-break-inside: avoid; margin: 10px 0; }
h3 { font-size: 12px; color: #1a3790; margin: 0 0 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
.num { display: inline-block; min-width: 22px; height: 18px; border-radius: 9px; background: #1a3790; color: #fff; text-align: center; font-size: 10px; line-height: 18px; margin-right: 8px; }
table.bi { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.bi td.col { vertical-align: top; width: 50%; padding: 0 8px; }
table.bi td.col + td.col { border-left: 1px solid #e2e8f0; color: #3b4459; }
table.bi p { margin: 0; }
.callout { border-left: 3px solid #8a5110; padding: 4px 8px; background: #fff7ec; }
.ini { text-align: right; color: #5c6578; font-size: 9px; margin: 4px 0 0; }
.line { display: inline-block; border-bottom: 1px solid #1c2438; min-width: 220px; height: 26px; position: relative; }
.line.short { min-width: 80px; height: 16px; margin-left: 4px; }
.anchor { color: #ffffff; font-size: 1px; }
.sigs { display: flex; flex-wrap: wrap; gap: 18px 30px; margin-top: 14px; page-break-inside: avoid; }
.sig { width: 46%; } .sig .who { font-weight: 700; } .sig .role, .sig .cap { color: #5c6578; font-size: 9px; }
.foot { margin-top: 18px; color: #5c6578; font-size: 9px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style></head>
<body>
<div class="hdr"><img src="${AGREEMENT_LOGO_DATA_URI}" alt="KidEase"><div><div class="brand">KidEase</div><h1>${frFirst ? "Entente d’inscription · Enrolment agreement" : "Enrolment agreement · Entente d’inscription"}</h1><div class="sub">${e(parties.centreName)} — ${e(where)} — Licence / Permis ${e(parties.licence || "—")}</div></div></div>
<div class="card"><table>
${guardianRows}
<tr><td>${frFirst ? "Enfant" : "Child"}</td><td><b>${e(parties.childName)}</b> — ${e(parties.childBirthdate)}</td></tr>
<tr><td>${frFirst ? "Signataire du centre" : "Centre signer"}</td><td>${e(parties.directorName)}</td></tr>
<tr><td>${frFirst ? "Province" : "Province"}</td><td>${e(frFirst ? province.nameFr : province.nameEn)}</td></tr>
</table></div>
${sections}
<h3>${frFirst ? "Signatures / Signatures" : "Signatures"}</h3>
<div class="sigs">${sigBlocks}</div>
<div class="foot">${frFirst ? "Envoyé via KidEase. KidEase n’est pas une partie à cette entente." : "Sent via KidEase. KidEase is not a party to this agreement."} ${AGREEMENT_TEMPLATE_VERSION}</div>
</body></html>`;
}

/** DocuSign signers for guardians 2..4: recipientId 3+, routing 1 (parallel with parent 1). */
export function coparentSignerInputs(rows: { name: string; email: string }[]) {
  return rows.map((row, idx) => {
    const a = guardianAnchors(idx + 1);
    return { email: row.email, name: row.name, recipientId: String(idx + 3), routingOrder: "1", anchorString: a.sign, initialAnchor: a.initial, dateAnchor: a.date, roleName: "Guardian" };
  });
}
