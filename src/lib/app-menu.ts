import type { DeskKey } from "./desks.ts";
import type { ChromeRole } from "./role-access.ts";
import { footerLinkHrefs, footerLinksForShell, type FooterLinkDef } from "./site-footer-nav.ts";

/** Groups on the phone Menu. Together they cover every footer page. */
export type MenuGroupId = "resources" | "guides" | "help" | "legal";

const GROUP: Record<string, MenuGroupId> = {
  "/claim": "resources",
  "/plans": "resources",
  "/verify": "resources",
  "/daycare-requirements": "resources",
  "/start-a-daycare": "resources",
  "/jobs": "resources",
  "/about": "resources",
  "/team": "resources",
  "/donate": "resources",
  "/get-app": "resources",
  "/search": "guides",
  "/cities": "guides",
  "/compare": "guides",
  "/tour-checklist": "guides",
  "/benefits": "guides",
  "/help": "help",
  "/faq": "help",
  "/how-it-works": "help",
  "/contact": "help",
  "/report": "help",
  "/privacy": "legal",
  "/terms": "legal",
  "/cookies": "legal",
  "/status": "legal",
};

export function menuGroupForHref(href: string): MenuGroupId | null {
  return GROUP[href] ?? null;
}

export function menuGroupLinks(
  group: MenuGroupId,
  input: { native: boolean; plansOn: boolean },
): FooterLinkDef[] {
  return footerLinksForShell(input).filter((link) => menuGroupForHref(link.to) === group);
}

/** Footer pages the Menu does not link. Empty when every footer href has a group. */
export function uncoveredFooterHrefs(hrefs: readonly string[] = footerLinkHrefs()): string[] {
  return hrefs.filter((href) => !menuGroupForHref(href));
}

/**
 * One highlighted card. Daycares get Create a listing, unless they are
 * currently on the parent desk. Everyone else gets Find daycare.
 */
export function menuHighlight(input: {
  role: ChromeRole;
  ownsCentre: boolean;
  currentDesk: DeskKey | null;
}): "create" | "find" {
  const host = input.role === "provider" || input.ownsCentre;
  if (!host) return "find";
  if (input.currentDesk === "parent") return "find";
  return "create";
}

/**
 * The other parent/daycare desk for the floating pill.
 * Needs both desks. Admin and a blank menu switch toward Parent.
 */
export function roleSwitchTarget(
  current: DeskKey | null,
  desks: readonly DeskKey[],
): "parent" | "provider" | null {
  if (!desks.includes("parent") || !desks.includes("provider")) return null;
  if (current === "parent") return "provider";
  return "parent";
}
