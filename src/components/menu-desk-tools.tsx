import { MenuRow } from "@/components/menu-row";
import { useRoleChrome } from "@/components/role-chrome";
import { useSessionDesks } from "@/components/desk-switcher";
import { canSeeAdminDesk } from "@/lib/desks";
import type { MenuIconId } from "@/lib/menu-icons";
import { upgradeNavLabel } from "@/lib/role-access";
import { useCopy } from "@/lib/use-copy";

type DeskMenuRow = {
  to: string;
  search?: Record<string, string>;
  label: string;
  icon: MenuIconId;
};

type DeskMenuGroup = {
  title: string;
  rows: DeskMenuRow[];
};

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7" data-ke="desk-menu-group">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function MenuDeskTools() {
  const { t } = useCopy();
  const chrome = useRoleChrome();
  const { session } = useSessionDesks();
  const plan = upgradeNavLabel(Boolean(chrome.paid));
  const admin = Boolean(canSeeAdminDesk(session?.role, session?.email));

  const groups: DeskMenuGroup[] =
    chrome.role === "admin"
      ? [
          {
            title: "Review",
            rows: [
              { to: "/admin", search: { tab: "queue" }, label: "Waiting on you", icon: "verify" },
              { to: "/admin", search: { tab: "incomplete" }, label: "Needs complete", icon: "claim" },
              { to: "/admin", search: { tab: "verify" }, label: "Licence & photos", icon: "verify" },
              { to: "/admin", search: { tab: "reviews" }, label: "Reviews", icon: "rate" },
            ],
          },
          {
            title: "Centres",
            rows: [
              { to: "/admin", search: { tab: "daycares" }, label: "Daycares", icon: "daycare" },
              { to: "/admin", search: { tab: "winnipeg" }, label: "Winnipeg gaps", icon: "explore" },
            ],
          },
          {
            title: "Trust",
            rows: [
              { to: "/admin", search: { tab: "trust" }, label: "Trust", icon: "privacy" },
              { to: "/admin", search: { tab: "screening" }, label: "Screening", icon: "tourChecklist" },
            ],
          },
          {
            title: "Money",
            rows: [
              { to: "/admin", search: { tab: "contracts" }, label: "Contracts", icon: "terms" },
              { to: "/admin", search: { tab: "money" }, label: "Money", icon: "benefits" },
            ],
          },
          {
            title: "Platform",
            rows: [
              { to: "/admin", search: { tab: "activity" }, label: "Activity", icon: "howItWorks" },
              { to: "/admin-chat", label: "Chat lab", icon: "messages" },
              { to: "/support", label: "Support", icon: "support" },
            ],
          },
          {
            title: t("account"),
            rows: [
              { to: "/account", search: { tab: "profile", desk: "admin" }, label: t("profile"), icon: "profile" },
              { to: "/parent", label: "Open parent desk", icon: "parent" },
              { to: "/provider", label: "Open daycare desk", icon: "daycare" },
            ],
          },
        ]
      : chrome.role === "provider"
        ? [
            {
              title: "Centre",
              rows: [
                { to: "/provider", search: { desk: "tours" }, label: t("tourTimes"), icon: "tourChecklist" },
                { to: "/provider", search: { desk: "employees" }, label: t("employeesTitle"), icon: "team" },
                { to: "/provider", search: { desk: "screening" }, label: t("listingCoachOpenScreening"), icon: "verify" },
                { to: "/provider", search: { desk: "licence" }, label: t("listingCoachOpenLicence"), icon: "claim" },
                { to: "/provider", search: { desk: "contract" }, label: t("deskNavContract"), icon: "terms" },
              ],
            },
            {
              title: "Growth",
              rows: [
                { to: "/provider", search: { desk: "promote" }, label: t("deskNavPromote"), icon: "benefits" },
                { to: "/claim", label: t("deskNavClaim"), icon: "claim" },
                { to: "/provider", search: { desk: "listings" }, label: t("deskNavAddListing"), icon: "startDaycare" },
              ],
            },
            {
              title: t("account"),
              rows: [
                { to: "/account", search: { tab: "profile", desk: "director" }, label: t("profile"), icon: "profile" },
                { to: "/provider/subscription", label: plan, icon: "benefits" },
              ],
            },
          ]
        : chrome.role === "parent"
          ? [
              {
                title: "Family",
                rows: [
                  { to: "/parent", search: { tab: "children" }, label: t("children"), icon: "parent" },
                  { to: "/parent", search: { tab: "care" }, label: t("dailyCare"), icon: "tourChecklist" },
                ],
              },
              {
                title: "Find care",
                rows: [
                  { to: "/parent", search: { tab: "alerts" }, label: t("searchAlerts"), icon: "notifications" },
                  { to: "/search", label: t("wayfindFindCare"), icon: "explore" },
                ],
              },
              {
                title: t("account"),
                rows: [
                  { to: "/parent", search: { tab: "payments" }, label: t("payments"), icon: "benefits" },
                  { to: "/parent", search: { tab: "payments" }, label: plan, icon: "benefits" },
                  { to: "/account", search: { tab: "profile", desk: "parent" }, label: t("profile"), icon: "profile" },
                ],
              },
            ]
          : [];

  if (!groups.length) return null;

  return (
    <div data-ke="desk-menu-tools" data-role={chrome.role}>
      {groups.map((group) => (
        <Group key={group.title} title={group.title}>
          {group.rows.map((row) => (
            <MenuRow
              key={`${row.to}:${row.label}`}
              to={row.to}
              search={row.search}
              label={row.label}
              icon={row.icon}
            />
          ))}
        </Group>
      ))}
      {admin && chrome.role !== "admin" ? (
        <Group title="KidEase">
          <MenuRow to="/admin" label="Admin desk" icon="admin" />
        </Group>
      ) : null}
    </div>
  );
}
