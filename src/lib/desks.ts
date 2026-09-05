export type AppRole = "admin" | "provider" | "parent";
export type DeskKey = "admin" | "provider" | "parent";

export const DESK_PATH: Record<DeskKey, "/admin" | "/provider" | "/parent"> = {
  admin: "/admin",
  provider: "/provider",
  parent: "/parent",
};

export const DESK_LABEL: Record<DeskKey, string> = {
  admin: "Admin",
  provider: "Provider",
  parent: "Parent",
};

export const ROLE_RANK: Record<AppRole, number> = {
  parent: 0,
  provider: 1,
  admin: 2,
};

export function parseAppRole(raw: string | null | undefined): AppRole {
  const v = (raw || "").trim().toLowerCase();
  if (v === "admin") return "admin";
  if (v === "provider") return "provider";
  return "parent";
}

export function primaryDesk(desks: DeskKey[]): DeskKey {
  if (desks.includes("admin")) return "admin";
  if (desks.includes("provider")) return "provider";
  return "parent";
}

export function landingPath(desks: DeskKey[]): "/admin" | "/provider" | "/parent" {
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
    desks.add("provider");
  }
  if (input.role === "provider" || input.ownsCentre) {
    desks.add("provider");
  }
  return (["admin", "provider", "parent"] as const).filter((d) => desks.has(d));
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
  home: "/admin" | "/provider" | "/parent";
  unread: number;
  stripeLive: boolean;
  ledgerLabel: string;
  /** Subscription tab on the provider desk (admin ghost, or flag on). */
  providerSubscriptions: boolean;
};

/** Never demote an admin when a page or claim writes provider/parent. */
export function nextStoredRole(current: AppRole | string | null | undefined, requested: AppRole): AppRole {
  const cur = parseAppRole(current);
  if (cur === "admin") return "admin";
  return requested === "admin" ? "admin" : requested;
}
