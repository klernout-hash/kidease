/**
 * Statutory staff-to-child planning guide for licensed rooms.
 * Confirm the current regulation with the ministry. This is not a licence decision.
 */

export const RATIO_PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"] as const;
export type RatioProvince = (typeof RATIO_PROVINCES)[number];
export type RoomBand = "infant" | "toddler" | "preschool" | "school-age";

export type RoomRule = { staffToChildren: number; maxGroup: number };

const TABLE: Record<RatioProvince, Record<RoomBand, RoomRule>> = {
  BC: { infant: { staffToChildren: 4, maxGroup: 12 }, toddler: { staffToChildren: 4, maxGroup: 12 }, preschool: { staffToChildren: 8, maxGroup: 25 }, "school-age": { staffToChildren: 12, maxGroup: 24 } },
  AB: { infant: { staffToChildren: 4, maxGroup: 8 }, toddler: { staffToChildren: 6, maxGroup: 12 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  SK: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 5, maxGroup: 10 }, preschool: { staffToChildren: 10, maxGroup: 20 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  MB: { infant: { staffToChildren: 4, maxGroup: 8 }, toddler: { staffToChildren: 6, maxGroup: 12 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  ON: { infant: { staffToChildren: 3, maxGroup: 10 }, toddler: { staffToChildren: 5, maxGroup: 15 }, preschool: { staffToChildren: 8, maxGroup: 24 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  QC: { infant: { staffToChildren: 5, maxGroup: 10 }, toddler: { staffToChildren: 8, maxGroup: 16 }, preschool: { staffToChildren: 10, maxGroup: 20 }, "school-age": { staffToChildren: 20, maxGroup: 30 } },
  NB: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 5, maxGroup: 10 }, preschool: { staffToChildren: 10, maxGroup: 20 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  NS: { infant: { staffToChildren: 4, maxGroup: 8 }, toddler: { staffToChildren: 6, maxGroup: 18 }, preschool: { staffToChildren: 8, maxGroup: 24 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  PE: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 5, maxGroup: 10 }, preschool: { staffToChildren: 10, maxGroup: 20 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  NL: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 5, maxGroup: 10 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 15, maxGroup: 30 } },
  YT: { infant: { staffToChildren: 4, maxGroup: 8 }, toddler: { staffToChildren: 6, maxGroup: 12 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 12, maxGroup: 24 } },
  NT: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 4, maxGroup: 8 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 10, maxGroup: 20 } },
  NU: { infant: { staffToChildren: 3, maxGroup: 6 }, toddler: { staffToChildren: 5, maxGroup: 10 }, preschool: { staffToChildren: 8, maxGroup: 16 }, "school-age": { staffToChildren: 12, maxGroup: 24 } },
};

export function ratioRule(province: string, band: RoomBand): RoomRule {
  const code = province.trim().toUpperCase();
  const table = (TABLE as Record<string, Record<RoomBand, RoomRule>>)[code] ?? TABLE.ON;
  return table[band];
}

export type RatioStatus = "ok" | "near" | "out";

export function ratioStatus(children: number, staff: number, rule: RoomRule): RatioStatus {
  const kids = Math.max(0, Math.floor(children));
  const adults = Math.max(0, Math.floor(staff));
  if (kids === 0) return "ok";
  if (adults === 0 || kids > adults * rule.staffToChildren || kids > rule.maxGroup) return "out";
  const atLimit = kids === adults * rule.staffToChildren || kids === rule.maxGroup;
  if (!atLimit && (kids / adults >= rule.staffToChildren * 0.85 || kids >= rule.maxGroup * 0.85)) return "near";
  return "ok";
}

export const CURRICULUM_TAGS = [
  { id: "hdlh", en: "HDLH", fr: "HDLH" },
  { id: "flight", en: "Flight", fr: "Flight" },
  { id: "accueillir", en: "Accueillir la petite enfance", fr: "Accueillir la petite enfance" },
  { id: "elf", en: "ELF", fr: "ELF" },
  { id: "montessori", en: "Montessori", fr: "Montessori" },
] as const;
