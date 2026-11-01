/**
 * Statutory staff-to-child planning guide for licensed rooms.
 * Confirm the current regulation with the ministry. This is not a licence decision.
 */

export const RATIO_PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
export type RatioProvince = (typeof RATIO_PROVINCES)[number];
export type RoomBand = "infant" | "toddler" | "preschool" | "school-age";

export type RoomRule = {
  staffToChildren: number;
  maxGroup: number;
  /** False when this pass did not read the regulation. The board must not show the numbers. */
  verified: boolean;
  /** False when a maximum group size was not in the text that was read. */
  showMax: boolean;
  source: string;
};

const CHECKED = "Checked 1 November 2026.";

const TABLE: Record<RatioProvince, Record<RoomBand, RoomRule>> = {
  BC: {
    infant: { staffToChildren: 4, maxGroup: 12, verified: true, showMax: true, source: `B.C. Reg. 332/2007, Schedule E, group care under 36 months. ${CHECKED} https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/332_2007` },
    toddler: { staffToChildren: 4, maxGroup: 12, verified: true, showMax: true, source: `British Columbia has no separate toddler ratio. Under 36 months is 1:4, maximum 12. ${CHECKED} https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/332_2007` },
    preschool: { staffToChildren: 8, maxGroup: 25, verified: true, showMax: true, source: `B.C. Reg. 332/2007, Schedule E. 30 months to school age is stepped: 1 staff to 8, 2 to 16, 3 to 25. A straight 1:8 can flag 25 children with 3 staff. ${CHECKED}` },
    "school-age": { staffToChildren: 12, maxGroup: 24, verified: true, showMax: true, source: `B.C. Reg. 332/2007, Schedule E, when a preschool child or a child in grade 1 is present. If none are present, the row is 1:15, maximum 30. ${CHECKED}` },
  },
  AB: {
    infant: { staffToChildren: 3, maxGroup: 6, verified: true, showMax: true, source: `Alta. Reg. 143/2008, under 12 months. 12 to 19 months is 1:4, maximum 8. ${CHECKED} https://www.canlii.org/en/ab/laws/regu/alta-reg-143-2008/latest/alta-reg-143-2008.html` },
    toddler: { staffToChildren: 6, maxGroup: 12, verified: true, showMax: true, source: `Alta. Reg. 143/2008, 19 months to 3 years. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 16, verified: true, showMax: true, source: `Alta. Reg. 143/2008, 3 to 4 years. 4 to 6 years is 1:10, maximum 20. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `Alta. Reg. 143/2008, school age. ${CHECKED}` },
  },
  SK: {
    infant: { staffToChildren: 3, maxGroup: 6, verified: true, showMax: true, source: `The Child Care Regulations, 2015, s. 51 and s. 52. Infant is 6 weeks to under 18 months. ${CHECKED}` },
    toddler: { staffToChildren: 5, maxGroup: 10, verified: true, showMax: true, source: `The Child Care Regulations, 2015, s. 51 and s. 52. Toddler is 18 to under 30 months. ${CHECKED}` },
    preschool: { staffToChildren: 10, maxGroup: 20, verified: true, showMax: true, source: `The Child Care Regulations, 2015, s. 51 and s. 52. Preschool is 30 months or more and not yet in grade 1, including kindergarten. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `The Child Care Regulations, 2015, s. 51 and s. 52. ${CHECKED}` },
  },
  MB: {
    infant: { staffToChildren: 4, maxGroup: 8, verified: true, showMax: true, source: `Man. Reg. 62/86, s. 8(2)(a), mixed ages, 12 weeks to 2 years. A separate room under 1 year is 1:3, maximum 6. ${CHECKED}` },
    toddler: { staffToChildren: 6, maxGroup: 12, verified: true, showMax: true, source: `Man. Reg. 62/86, s. 8(2)(b), separate ages, 2 to 3 years. Mixed ages from 2 to 6 years are 1:8, maximum 16. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 16, verified: true, showMax: true, source: `Man. Reg. 62/86, s. 8(2)(a), mixed ages, 2 to 6 years. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `Man. Reg. 62/86, s. 8, 6 to 12 years. ${CHECKED}` },
  },
  ON: {
    infant: { staffToChildren: 3, maxGroup: 10, verified: true, showMax: true, source: `O. Reg. 137/15, Schedule 1. The full infant rule is 3 staff for up to 10 children. ${CHECKED} https://www.ontario.ca/laws/regulation/150137` },
    toddler: { staffToChildren: 5, maxGroup: 15, verified: true, showMax: true, source: `O. Reg. 137/15, Schedule 1, 18 to 30 months. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 24, verified: true, showMax: true, source: `O. Reg. 137/15, Schedule 1, 30 months to 6 years. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `O. Reg. 137/15, Schedule 1, primary/junior school age. Kindergarten is 1:13, maximum 26. ${CHECKED}` },
  },
  QC: bandPlaceholder("QC"),
  NB: {
    infant: { staffToChildren: 3, maxGroup: 9, verified: true, showMax: true, source: `N.B. Reg. 2018-11, s. 9. Infant is under 2. The group may need up to three educators. ${CHECKED} https://laws.gnb.ca/en/document/cr/2018-11` },
    toddler: { staffToChildren: 5, maxGroup: 10, verified: true, showMax: true, source: `N.B. Reg. 2018-11, s. 9, children who are two. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 16, verified: true, showMax: true, source: `N.B. Reg. 2018-11, s. 9, children who are three. Children who are four or older and not in school are 1:10, maximum 20. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `N.B. Reg. 2018-11, s. 9. ${CHECKED}` },
  },
  NS: {
    infant: { staffToChildren: 4, maxGroup: 10, verified: true, showMax: true, source: `N.S. Early Learning and Child Care Regulations, s. 34. Infant is under 18 months. ${CHECKED} https://novascotia.ca/just/regulations/regs/elcc.htm` },
    toddler: { staffToChildren: 6, maxGroup: 18, verified: true, showMax: true, source: `N.S. Regulations, s. 34. Toddler is 18 to 35 months. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 24, verified: true, showMax: true, source: `N.S. Regulations, s. 34. Preschooler is 36 months or older and not in school. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 30, verified: true, showMax: true, source: `N.S. Regulations, s. 34, school-age only. ${CHECKED}` },
  },
  PE: {
    infant: { staffToChildren: 3, maxGroup: 3, verified: true, showMax: false, source: `P.E.I. Early Learning and Child Care Act Regulations, s. 19(1), indoor, under 22 months. Maximum group size was not in that section. ${CHECKED}` },
    toddler: { staffToChildren: 5, maxGroup: 5, verified: true, showMax: false, source: `P.E.I. Regulations, s. 19(1), indoor, 22 months to 3 years. Maximum group size was not in that section. ${CHECKED}` },
    preschool: { staffToChildren: 10, maxGroup: 10, verified: true, showMax: false, source: `P.E.I. Regulations, s. 19(1), indoor, over 3 years to school entry. Maximum group size was not in that section. ${CHECKED}` },
    "school-age": { staffToChildren: 15, maxGroup: 15, verified: true, showMax: false, source: `P.E.I. Regulations, s. 19(1), indoor, school-age. Maximum group size was not in that section. ${CHECKED}` },
  },
  NL: bandPlaceholder("NL"),
  YT: {
    infant: { staffToChildren: 4, maxGroup: 8, verified: true, showMax: true, source: `Y.O.I.C. 1995/087, s. 5, infants up to 18 months. ${CHECKED}` },
    toddler: { staffToChildren: 6, maxGroup: 12, verified: true, showMax: true, source: `Y.O.I.C. 1995/087, s. 5, under 3 years when no infant is present. ${CHECKED}` },
    preschool: { staffToChildren: 8, maxGroup: 16, verified: true, showMax: true, source: `Y.O.I.C. 1995/087, s. 5, preschool age 3 or older. ${CHECKED}` },
    "school-age": { staffToChildren: 12, maxGroup: 24, verified: true, showMax: true, source: `Y.O.I.C. 1995/087, s. 5, school-age. ${CHECKED}` },
  },
  NT: bandPlaceholder("NT"),
  NU: bandPlaceholder("NU"),
};

function bandPlaceholder(code: string): Record<RoomBand, RoomRule> {
  const source = `PLACEHOLDER. The ${code} regulation text was not opened on 1 November 2026. These counts are not shown.`;
  const hidden = { verified: false, showMax: false, source };
  return {
    infant: { staffToChildren: 3, maxGroup: 6, ...hidden },
    toddler: { staffToChildren: 5, maxGroup: 10, ...hidden },
    preschool: { staffToChildren: 8, maxGroup: 16, ...hidden },
    "school-age": { staffToChildren: 15, maxGroup: 30, ...hidden },
  };
}

export function ratioRule(province: string, band: RoomBand): RoomRule | null {
  const code = province.trim().toUpperCase();
  const table = (TABLE as Record<string, Record<RoomBand, RoomRule> | undefined>)[code];
  if (!table) return null;
  return table[band] ?? null;
}

export type RatioStatus = "ok" | "near" | "out" | "unknown";

export function ratioStatus(children: number, staff: number, rule: RoomRule): RatioStatus {
  if (!rule.verified) return "unknown";
  const kids = Math.max(0, Math.floor(children));
  const adults = Math.max(0, Math.floor(staff));
  if (kids === 0) return "ok";
  const overGroup = rule.showMax && kids > rule.maxGroup;
  if (adults === 0 || kids > adults * rule.staffToChildren || overGroup) return "out";
  const atLimit = kids === adults * rule.staffToChildren || (rule.showMax && kids === rule.maxGroup);
  const nearGroup = rule.showMax && kids >= rule.maxGroup * 0.85;
  if (!atLimit && (kids / adults >= rule.staffToChildren * 0.85 || nearGroup)) return "near";
  return "ok";
}

export const CURRICULUM_TAGS = [
  { id: "hdlh", en: "HDLH", fr: "HDLH" },
  { id: "flight", en: "Flight", fr: "Flight" },
  { id: "accueillir", en: "Accueillir la petite enfance", fr: "Accueillir la petite enfance" },
  { id: "elf", en: "ELF", fr: "ELF" },
  { id: "montessori", en: "Montessori", fr: "Montessori" },
] as const;
