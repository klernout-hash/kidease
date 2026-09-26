/**
 * Admin notify + activity copy for new parent / daycare-provider accounts.
 * Kept free of DB / Start so unit tests can import it.
 */

export const ADMIN_PEOPLE_DAYS = 30;

export type AccountNotifyRole = "parent" | "provider";

export type AccountNotifyInput = {
  role: AccountNotifyRole;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  province?: string | null;
  authMethod?: string | null;
  daycareName?: string | null;
};

export type AccountEventDetail = {
  role?: AccountNotifyRole;
  phone?: string | null;
  authMethod?: string | null;
};

const AUTH_METHOD_LABEL: Record<string, string> = {
  credential: "email/password",
  email: "email/password",
  password: "email/password",
  google: "Google",
  "grok-google": "Google",
  facebook: "Facebook",
  apple: "Apple",
};

export function accountRoleLabel(role: AccountNotifyRole | string | null | undefined): string {
  return role === "provider" ? "Daycare provider" : "Parent";
}

export function accountSmsRole(role: AccountNotifyRole): "parent" | "daycare" {
  return role === "provider" ? "daycare" : "parent";
}

export function displayName(name?: string | null): string {
  const v = (name || "").replace(/\s+/g, " ").trim();
  return v || "—";
}

export function ellipsisEmail(email?: string | null): string {
  const v = (email || "").trim();
  if (!v) return "";
  const at = v.indexOf("@");
  if (at <= 0) return v;
  return `${v.slice(0, at)}@…`;
}

export function authMethodLabel(providerId?: string | null): string {
  const id = (providerId || "").trim().toLowerCase();
  if (!id) return "";
  if (AUTH_METHOD_LABEL[id]) return AUTH_METHOD_LABEL[id];
  if (id.includes("google")) return "Google";
  if (id.includes("apple")) return "Apple";
  if (id.includes("facebook")) return "Facebook";
  if (id.includes("credential") || id.includes("password") || id === "email") return "email/password";
  return "";
}

export function summarizeAuthMethods(providerIds?: Array<string | null | undefined> | null): string {
  const labels = [...new Set((providerIds || []).map(authMethodLabel).filter(Boolean))];
  return labels.join(", ");
}

export function formatPlace(city?: string | null, province?: string | null): string {
  const c = (city || "").trim();
  const p = (province || "").trim();
  if (c && p) return `${c} ${p}`;
  return c || p;
}

export function formatWinnipegShortTime(at: Date = new Date()): string {
  return at.toLocaleString("en-US", {
    timeZone: "America/Winnipeg",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatWinnipegFull(at: Date = new Date()): string {
  return at.toLocaleString("en-CA", {
    timeZone: "America/Winnipeg",
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function isAccountEventKind(kind?: string | null): boolean {
  return kind === "account" || kind === "signup";
}

/** Signup + listing rows must stay on Activity even when daycare_name is empty or email failed. */
export function isSignupActivityKind(kind?: string | null): boolean {
  return kind === "account" || kind === "signup" || kind === "listing";
}

export function activityEmailFailed(status?: string | null): boolean {
  return (status || "").trim().toLowerCase() === "failed";
}

export function activityEmailStatusLabel(status?: string | null): string {
  const v = (status || "").trim() || "unknown";
  return activityEmailFailed(v) ? "Email failed" : `email ${v}`;
}

/** Parent / provider accounts stay on People even with no phone or city (Joan-like). */
export function adminPersonEligible(row: {
  role?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  city?: string | null;
}): boolean {
  if (row.role !== "parent" && row.role !== "provider") return false;
  return Boolean((row.email || "").trim() || (row.name || "").trim());
}

export function accountRoleFromKind(kind?: string | null): AccountNotifyRole | null {
  if (kind === "signup") return "provider";
  if (kind === "account") return "parent";
  return null;
}

export function accountNotifyTitle(role: AccountNotifyRole): string {
  return role === "provider" ? "New daycare provider account" : "New parent account";
}

export function adminPeoplePath(role?: AccountNotifyRole | "all" | null): string {
  if (role === "parent" || role === "provider") return `/admin?tab=people&role=${role}`;
  return "/admin?tab=people";
}

export function adminActivityPath(kind?: string | null): string {
  const mapped = parseAdminActivityKind(kind);
  if (mapped === "all") return "/admin?tab=activity";
  return `/admin?tab=activity&kind=${encodeURIComponent(mapped)}`;
}

export function adminAccountDeepLink(
  origin: string,
  role: AccountNotifyRole,
): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${adminPeoplePath(role)}`;
}

export function parseAdminActivityKind(raw?: string | null): string {
  const v = (raw || "").trim().toLowerCase();
  if (!v || v === "all") return "all";
  const compact = v.replace(/[\s_]+/g, "-");
  if (v === "parent" || v === "parents" || v === "account") return "account";
  if (
    compact === "daycare" ||
    compact === "provider" ||
    compact === "providers" ||
    compact === "signup" ||
    compact === "daycare-providers"
  ) {
    return "signup";
  }
  if (v === "claim" || v === "claims") return "claim";
  if (v === "listing" || v === "listings") return "listing";
  return v;
}

export const ACTIVITY_KIND_CHIPS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "account", label: "Parents" },
  { id: "signup", label: "Daycare providers" },
  { id: "listing", label: "Listings" },
  { id: "claim", label: "Claims" },
];

export function activityPeopleSearch(row: {
  kind?: string | null;
  provider_email?: string | null;
}): { tab: "people"; role: AccountNotifyRole; q?: string } {
  const q = (row.provider_email || "").trim();
  return {
    tab: "people",
    role: row.kind === "account" ? "parent" : "provider",
    ...(q ? { q } : {}),
  };
}

export function activityPeopleHref(row: {
  kind?: string | null;
  provider_email?: string | null;
}): string {
  const search = activityPeopleSearch(row);
  return adminDeskHref(search);
}

export function serializeAccountEventDetail(d: AccountEventDetail): string {
  return JSON.stringify({
    role: d.role === "provider" ? "provider" : d.role === "parent" ? "parent" : undefined,
    phone: (d.phone || "").trim() || null,
    authMethod: (d.authMethod || "").trim() || null,
  });
}

export function parseAccountEventDetail(raw?: string | null): AccountEventDetail {
  const text = (raw || "").trim();
  if (!text) return {};
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (!v || typeof v !== "object") return {};
    const role = v.role === "provider" || v.role === "parent" ? v.role : undefined;
    const phone = typeof v.phone === "string" ? v.phone.trim() : "";
    const authMethod = typeof v.authMethod === "string" ? v.authMethod.trim() : "";
    return {
      role,
      phone: phone || null,
      authMethod: authMethod || null,
    };
  } catch {
    return {};
  }
}

export function accountNotifyRows(input: AccountNotifyInput, when: string): Array<[string, string]> {
  const place = formatPlace(input.city, input.province);
  const rows: Array<[string, string]> = [
    ["Role", accountRoleLabel(input.role)],
    ["Name", displayName(input.name)],
    ["Email", (input.email || "").trim() || "—"],
    ["Phone", (input.phone || "").trim() || "—"],
    ["City / province", place || "—"],
    ["Signed in with", (input.authMethod || "").trim() || "—"],
    ["When", `${when} (Winnipeg)`],
  ];
  if ((input.daycareName || "").trim()) rows.splice(5, 0, ["Daycare", input.daycareName!.trim()]);
  return rows;
}

export function accountNotifyText(input: AccountNotifyInput, when: string, adminUrl: string): string {
  const rows = accountNotifyRows(input, when);
  return [accountNotifyTitle(input.role), "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Open Admin: ${adminUrl}`].join(
    "\n",
  );
}

/** Short enough for SMS. Kyle should see WHO without opening email. */
export function accountSmsBody(input: AccountNotifyInput, at: Date = new Date()): string {
  const who = displayName(input.name);
  const mail = ellipsisEmail(input.email);
  const place = formatPlace(input.city, input.province);
  const when = formatWinnipegShortTime(at);
  const parts = [`KidEase new ${accountSmsRole(input.role)}: ${who}`, mail, place, when].filter(Boolean);
  return parts.join(" · ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function activityWhoLine(input: {
  provider_name?: string | null;
  provider_email?: string | null;
}): string {
  const name = displayName(input.provider_name);
  const email = (input.provider_email || "").trim();
  return email ? `${name} · ${email}` : name;
}

export function activityAccountHeadline(row: {
  kind: string;
  daycare_name?: string | null;
  provider_name?: string | null;
  provider_email?: string | null;
}): string {
  if (isAccountEventKind(row.kind)) return activityWhoLine(row);
  if (row.kind === "listing") {
    const daycare = (row.daycare_name || "").trim();
    const who = activityWhoLine(row);
    return daycare && who !== "—" ? `${daycare} · ${who}` : daycare || who;
  }
  return (row.daycare_name || "").trim() || "Activity";
}

export function activityRoleBadge(kind?: string | null, detail?: string | null): string | null {
  if (kind === "listing") return accountRoleLabel("provider");
  const fromKind = accountRoleFromKind(kind);
  if (fromKind) return accountRoleLabel(fromKind);
  const parsed = parseAccountEventDetail(detail);
  if (parsed.role) return accountRoleLabel(parsed.role);
  return null;
}

/** name · email · role · city · time — never drop a row because email_status=failed. */
export function activitySignupMeta(row: {
  kind: string;
  provider_name?: string | null;
  provider_email?: string | null;
  city?: string | null;
  province?: string | null;
  daycare_name?: string | null;
  email_status?: string | null;
  created_at?: string | null;
  detail?: string | null;
}): { who: string; role: string; city: string; time: string; emailFailed: boolean } {
  const role = activityRoleBadge(row.kind, row.detail) || accountRoleLabel(accountRoleFromKind(row.kind) || "parent");
  const city = formatPlace(row.city, row.province) || (row.daycare_name || "").trim() || "—";
  const at = row.created_at ? new Date(row.created_at) : new Date();
  const time = Number.isNaN(at.getTime()) ? "—" : formatWinnipegFull(at);
  return {
    who: activityWhoLine(row),
    role,
    city,
    time,
    emailFailed: activityEmailFailed(row.email_status),
  };
}

export const ADMIN_DESK_TABS = [
  "queue",
  "incomplete",
  "winnipeg",
  "verify",
  "daycares",
  "trust",
  "screening",
  "mail",
  "contracts",
  "money",
  "people",
  "activity",
  "reviews",
] as const;

export type AdminDeskTab = (typeof ADMIN_DESK_TABS)[number];

export function isAdminDeskTab(raw?: string | null): raw is AdminDeskTab {
  return Boolean(raw && (ADMIN_DESK_TABS as readonly string[]).includes(raw));
}

export function resolveAdminTab(search: {
  tab?: string | null;
  kind?: string | null;
  role?: string | null;
}): AdminDeskTab {
  if (isAdminDeskTab(search.tab)) return search.tab;
  if (search.role === "parent" || search.role === "provider") return "people";
  if (search.kind) return "activity";
  return "queue";
}

export function adminDeskHref(search: {
  tab?: string | null;
  kind?: string | null;
  role?: string | null;
  q?: string | null;
  stat?: string | null;
}): string {
  const params = new URLSearchParams();
  if (search.tab) params.set("tab", search.tab);
  if (search.kind) params.set("kind", search.kind);
  if (search.role) params.set("role", search.role);
  if (search.q) params.set("q", search.q);
  if (search.stat) params.set("stat", search.stat);
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}
