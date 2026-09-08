import type { CopyKey } from "./copy.ts";

/** Shared FAQ key pairs so /faq and FAQPage JSON-LD stay in lockstep. */
export const FAQ_ITEM_KEYS = [
  ["faqQ1", "faqA1"],
  ["faqQ2", "faqA2"],
  ["faqQ3", "faqA3"],
  ["faqQ4", "faqA4"],
  ["faqQ5", "faqA5"],
  ["faqQ6", "faqA6"],
  ["faqQ7", "faqA7"],
  ["faqQ8", "faqA8"],
] as const satisfies ReadonlyArray<readonly [CopyKey, CopyKey]>;
