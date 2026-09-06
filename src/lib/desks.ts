export type AppRole = "admin" | "support_lead" | "support" | "provider" | "parent";
export type DeskKey = "admin" | "support" | "provider" | "parent";

export const DESK_PATH: Record<DeskKey, "/admin" | "/support" | "/provider" | "/parent"> = {
  admin: "/admin",
  support: "/support",
  provider: "/provider",
  parent: "/parent",
};

export const DESK_LABEL: Record<DeskKey, string> = {
  admin: "Admin",
  support: "Support",
  provider: "Director (Centre)",
  parent: "Parent",
};

/** Public deep-link aliases for `?desk=`. Provider tabs (listings, money, …) are not desks. */
export const DESK_QUERY_ALIASES: Record<string, DeskKey> = {
  parent: "parent",
  director: "provider",
  centre: "provider",
  center: "provider",
  daycare: "provider",
  provider: "provider",
  admin: "admin",
  support: "support",
};

export const PROVIDER_TAB_KEYS = ["requests", "money", "listings", "licence", "license", "contract", "promote"] as const;

export const STICKY_DESK_KEY = "kidease-desk";

const PATH_DESK: Array<[string, DeskKey]> = [
  ["/admin", "admin"],
  ["/support", "support"],
  ["/provider", "provider"],
  ["/parent", "parent"],
  ["/account", "parent"],
];

export function parseDeskQuery(raw: string | null | undefined): DeskKey | null {
  const v = (raw || "").trim().toLowerCase();
  return DESK_QUERY_ALIASES[v] ?? null;
}

export function isProviderTabKey(raw: string | null | undefined): boolean {
  const v = (raw || "").trim().toLowerCase();
  return (PROVIDER_TAB_KEYS as readonly string[]).includes(v);
}

/** Canonical `?desk=` value for a role desk (director, not provider). */
export function deskQueryValue(desk: DeskKey): "parent" | "director" | "admin" | "support" {
  if (desk === "provider") return "director";
  return desk;
}

export function loginRoleFromDesk(desk: DeskKey): "parent" | "provider" | "admin" {
  if (desk === "admin") return "admin";
  if (desk === "provider") return "provider";
  return "parent";
}

export function deskFromPathname(pathname: string): DeskKey | null {
  for (const [prefix, desk] of PATH_DESK) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return desk;
  }
  return null;
}

export function pickLandingDesk(desks: DeskKey[], preferred?: DeskKey | null): DeskKey {
  if (preferred && desks.includes(preferred)) return preferred;
  return primaryDesk(desks);
}

export function readStickyDesk(): DeskKey | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDeskQuery(window.sessionStorage.getItem(STICKY_DESK_KEY));
  } catch {
    return null;
  }
}

export function writeStickyDesk(desk: DeskKey): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STICKY_DESK_KEY, deskQueryValue(desk));
  } catch {
    /* ignore */
  }
}

export function clearStickyDesk(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STICKY_DESK_KEY);
  } catch {
    /* ignore */
  }
}

export const ROLE_RANK: Record<AppRole, number> = {
  parent: 0,
  provider: 1,
  support: 2,
  support_lead: 3,
  admin: 4,
};

export function parseAppRole(raw: string | null | undefined): AppRole {
  const v = (raw || "").trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "support_lead") return "support_lead";
  if (v === "support") return "support";
  if (v === "provider") return "provider";
  return "parent";
}

export function isStaffRole(role: AppRole | string | null | undefined): boolean {
  const r = parseAppRole(role);
  return r === "admin" || r === "support" || r === "support_lead";
}

export function primaryDesk(desks: DeskKey[]): DeskKey {
  if (desks.includes("admin")) return "admin";
  if (desks.includes("support")) return "support";
  if (desks.includes("provider")) return "provider";
  return "parent";
}

export function landingPath(desks: DeskKey[]): "/admin" | "/support" | "/provider" | "/parent" {
  return DESK_PATH[primaryDesk(desks)];
}

/**
 * Desks the signed-in user may open.
 * Dual parent + daycare on one Better Auth session is allowed (same email,
 * same cookie). `profiles.role` is a single stored primary — never put role
 * on the Better Auth session/JWT. DeskSwitcher is navigation-only.
 * A provider also keeps Parent so they can use a parent profile on the same email.
 */
export function desksFor(input: {
  role: AppRole;
  ownsCentre?: boolean;
}): DeskKey[] {
  const desks = new Set<DeskKey>(["parent"]);
  if (input.role === "admin") {
    desks.add("admin");
    desks.add("support");
    desks.add("provider");
  }
  if (input.role === "support" || input.role === "support_lead") {
    desks.add("support");
  }
  if (input.role === "provider" || input.ownsCentre) {
    desks.add("provider");
  }
  return (["admin", "support", "provider", "parent"] as const).filter((d) => desks.has(d));
}

export function canVisitDesk(desks: DeskKey[], desk: DeskKey) {
  return desks.includes(desk);
}

/** Header / menu switcher — only when this session actually has two desks. */
export function showDeskSwitcher(desks: DeskKey[] | undefined | null) {
  return Boolean(desks && desks.length >= 2);
}

export type SessionDesks = {
  role: AppRole;
  desks: DeskKey[];
  home: "/admin" | "/support" | "/provider" | "/parent";
  unread: number;
  stripeLive: boolean;
  ledgerLabel: string;
  /** Subscription tab on the provider desk (admin ghost, or flag on). */
  providerSubscriptions: boolean;
};

/** Never demote staff when a page or claim writes provider/parent. */
export function nextStoredRole(current: AppRole | string | null | undefined, requested: AppRole): AppRole {
  const cur = parseAppRole(current);
  if (cur === "admin") return "admin";
  if (cur === "support_lead") return "support_lead";
  if (cur === "support") return "support";
  return requested === "admin" ? "admin" : requested;
}
