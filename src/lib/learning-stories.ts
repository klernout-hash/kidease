/**
 * Private learning stories for one enrolled child.
 * No photos. A story is never a public listing.
 */

export const LEARNING_FRAMEWORKS = ["hdlh", "flight", "elf", "accueillir", "early-returns"] as const;
export type LearningFramework = (typeof LEARNING_FRAMEWORKS)[number];

export const FRAMEWORK_DOMAINS: Record<LearningFramework, readonly string[]> = {
  hdlh: ["belonging", "well-being", "engagement", "expression"],
  flight: ["well-being", "play", "communication", "diversity"],
  elf: ["belonging", "engagement", "communication", "identities"],
  accueillir: ["well-being", "belonging", "communication", "exploration"],
  // Manitoba's Early Returns framework: social, emotional, physical and cognitive development.
  "early-returns": ["social", "emotional", "physical", "cognitive"],
};

const PROVINCE_FRAMEWORK: Record<string, LearningFramework> = {
  ON: "hdlh",
  AB: "flight",
  BC: "elf",
  QC: "accueillir",
  MB: "early-returns",
};

const PROVINCE_NAMES: Record<string, string> = {
  ontario: "ON",
  alberta: "AB",
  "british columbia": "BC",
  "colombie-britannique": "BC",
  quebec: "QC",
  québec: "QC",
  manitoba: "MB",
};

function provinceKey(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return PROVINCE_NAMES[value.toLowerCase()] || "";
}

/** The centre's own provincial framework, or HDLH when the province has none on the list. */
export function frameworkForProvince(raw: string | null | undefined): LearningFramework {
  return PROVINCE_FRAMEWORK[provinceKey(raw)] || "hdlh";
}

/** Every framework, with the centre's province first (B05: a Manitoba centre sees Early Returns first). */
export function frameworksForProvince(raw: string | null | undefined): LearningFramework[] {
  const first = PROVINCE_FRAMEWORK[provinceKey(raw)];
  return first ? [first, ...LEARNING_FRAMEWORKS.filter((id) => id !== first)] : [...LEARNING_FRAMEWORKS];
}

export type StoryInput = {
  childId?: unknown;
  title?: unknown;
  body?: unknown;
  framework?: unknown;
  domain?: unknown;
  observedOn?: unknown;
  photo?: unknown;
  image?: unknown;
};

export type ParsedStory = {
  childId: string;
  title: string;
  body: string;
  framework: LearningFramework;
  domain: string;
  observedOn: string;
  isPrivate: true;
};

export function parseStory(input: StoryInput): { ok: true; story: ParsedStory } | { ok: false; error: "photo" | "child" | "text" | "framework" | "date" } {
  if (input.photo || input.image) return { ok: false, error: "photo" };
  const childId = String(input.childId || "").trim();
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(childId)) return { ok: false, error: "child" };
  const title = String(input.title || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const body = String(input.body || "").trim().slice(0, 4000);
  if (title.length < 2 || body.length < 2) return { ok: false, error: "text" };
  const framework = LEARNING_FRAMEWORKS.includes(input.framework as LearningFramework)
    ? (input.framework as LearningFramework)
    : null;
  if (!framework) return { ok: false, error: "framework" };
  const domain = String(input.domain || "").trim();
  if (!FRAMEWORK_DOMAINS[framework].includes(domain)) return { ok: false, error: "framework" };
  const observedOn = String(input.observedOn || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) return { ok: false, error: "date" };
  return { ok: true, story: { childId, title, body, framework, domain, observedOn, isPrivate: true } };
}

/** Enrolled parent of this child. A public visitor never qualifies. */
export function parentMayReadStory(input: { enrolled: boolean; ownsChild: boolean }): boolean {
  return input.enrolled === true && input.ownsChild === true;
}
