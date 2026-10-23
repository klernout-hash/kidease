import type { LegalBlock, LegalDoc, LegalSection } from "./legal-copy";

/**
 * Apple 3.1.1: a store build must not offer a purchase or name the pay methods.
 * Neutral sentences stay. The website is unchanged.
 */
const PURCHASE =
  /stripe checkout|apple pay|google pay|interac|\/donate|\bdeposits?\b|d[eé]p[oô]ts?/i;

export function mentionsStorePurchase(text: string): boolean {
  return PURCHASE.test(String(text || ""));
}

export function isStorePurchasePath(path: string): boolean {
  const bare = String(path || "")
    .split("?")[0]
    .replace(/^\/fr(?=\/|$)/, "") || "/";
  return (
    bare === "/donate" ||
    bare === "/plans" ||
    bare.startsWith("/pay") ||
    bare.includes("checkout.stripe.com") ||
    bare.includes("billing.stripe.com")
  );
}

function keepText(text: string): boolean {
  return !mentionsStorePurchase(text);
}

function filterBlock(block: LegalBlock): LegalBlock | null {
  if (block.type === "p") return keepText(block.text) ? block : null;
  if (block.type === "link") {
    if (isStorePurchasePath(block.to) || !keepText(block.label)) return null;
    return block;
  }
  if (block.type === "ul") {
    const items = block.items.filter(keepText);
    return items.length ? { ...block, items } : null;
  }
  if (block.type === "processors") {
    const items = block.items.filter((item) =>
      keepText(`${item.name} ${item.purpose} ${item.href ?? ""} ${item.hrefLabel ?? ""}`),
    );
    return items.length ? { ...block, items } : null;
  }
  const rows = block.rows.filter((row) => row.every(keepText));
  if (!block.headers.every(keepText) || rows.length === 0) return null;
  return { ...block, rows };
}

/** Drop purchase lines and empty sections. Does not change the source document. */
export function legalDocWithoutStorePurchase(doc: LegalDoc): LegalDoc {
  const sections: LegalSection[] = [];
  for (const section of doc.sections) {
    if (mentionsStorePurchase(section.title)) continue;
    const blocks = section.blocks.map(filterBlock).filter((block): block is LegalBlock => block != null);
    if (!blocks.length) continue;
    sections.push({ ...section, blocks });
  }
  return {
    ...doc,
    intro: doc.intro.filter(keepText),
    sections,
    storeItems: doc.storeItems?.filter(keepText),
  };
}
