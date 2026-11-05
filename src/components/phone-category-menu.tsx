import { Link, useRouterState } from "@tanstack/react-router";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { NotificationBell } from "@/components/notification-bell";
import { RoleSwitchPill } from "@/components/role-switch-pill";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { menuDeskPath, providerDeskPath } from "@/lib/desk-nav";
import { localePath } from "@/lib/locale-path";
import type { MenuIconId } from "@/lib/menu-icons";
import { useCopy } from "@/lib/use-copy";

type Row = {
  en: string;
  fr: string;
  icon: MenuIconId;
  to: string;
  search?: Record<string, string>;
  marker: string;
};

type Group = { en: string; fr: string; rows: Row[] };

function hostGroups(pathname: string): Group[] {
  const desk = providerDeskPath(pathname);
  const menu = menuDeskPath(pathname);
  return [
    {
      en: "Your centre",
      fr: "Votre centre",
      rows: [
        { en: "Listings", fr: "Fiches", icon: "daycare", to: desk, search: { desk: "listings" }, marker: "listings" },
        { en: "Hours and open spots", fr: "Heures et places", icon: "howItWorks", to: desk, search: { desk: "hours" }, marker: "hours" },
        { en: "Licence", fr: "Permis", icon: "verify", to: desk, search: { desk: "licence" }, marker: "licence" },
        { en: "Top Rated", fr: "Top Rated", icon: "rate", to: desk, search: { desk: "top-rated" }, marker: "top-rated" },
      ],
    },
    {
      en: "Families",
      fr: "Familles",
      rows: [
        { en: "Requests", fr: "Demandes", icon: "claim", to: desk, search: { desk: "requests" }, marker: "requests" },
        { en: "Tours", fr: "Visites", icon: "tourChecklist", to: desk, search: { desk: "tours" }, marker: "tours" },
        { en: "Calendar", fr: "Calendrier", icon: "explore", to: desk, search: { desk: "calendar" }, marker: "calendar" },
      ],
    },
    {
      en: "Team",
      fr: "Équipe",
      rows: [
        { en: "Employees", fr: "Employés", icon: "team", to: desk, search: { desk: "employees" }, marker: "employees" },
        { en: "Screening", fr: "Vérifications", icon: "privacy", to: desk, search: { desk: "screening" }, marker: "screening" },
      ],
    },
    {
      en: "Money",
      fr: "Argent",
      rows: [{ en: "Earnings", fr: "Revenus", icon: "terms", to: desk, search: { desk: "money" }, marker: "money" }],
    },
    accountGroup(menu),
    helpGroup(menu),
  ];
}

function parentGroups(pathname: string, locale: string): Group[] {
  const menu = menuDeskPath(pathname);
  const parent = locale === "fr" ? "/fr/parent" : "/parent";
  return [
    {
      en: "Find care",
      fr: "Trouver une garde",
      rows: [
        { en: "Search", fr: "Recherche", icon: "explore", to: localePath("/search", locale), marker: "search" },
        { en: "Saved", fr: "Favoris", icon: "saved", to: parent, search: { tab: "saved" }, marker: "saved" },
        { en: "Children", fr: "Enfants", icon: "parent", to: parent, search: { tab: "children" }, marker: "children" },
      ],
    },
    {
      en: "Your care",
      fr: "Votre garde",
      rows: [
        { en: "Requests and tours", fr: "Demandes et visites", icon: "tourChecklist", to: parent, search: { tab: "enrolled" }, marker: "requests" },
        { en: "Waitlists", fr: "Listes d'attente", icon: "claim", to: parent, search: { tab: "waitlists" }, marker: "waitlists" },
        { en: "Daily care", fr: "Soins du jour", icon: "howItWorks", to: parent, search: { tab: "care" }, marker: "care" },
      ],
    },
    accountGroup(menu),
    helpGroup(menu),
  ];
}

function accountGroup(menu: string): Group {
  return {
    en: "Account",
    fr: "Compte",
    rows: [
      { en: "Account settings", fr: "Paramètres du compte", icon: "settings", to: menu, search: { screen: "account" }, marker: "account" },
      { en: "Notifications", fr: "Notifications", icon: "notifications", to: menu, search: { screen: "notifications" }, marker: "notifications" },
      { en: "Language", fr: "Langue", icon: "language", to: menu, search: { screen: "language" }, marker: "language" },
    ],
  };
}

function helpGroup(menu: string): Group {
  return {
    en: "Help",
    fr: "Aide",
    rows: [
      { en: "Get help", fr: "Aide", icon: "help", to: menu, search: { section: "help" }, marker: "help" },
      { en: "Guides", fr: "Guides", icon: "howItWorks", to: menu, search: { section: "guides" }, marker: "guides" },
      { en: "Legal", fr: "Juridique", icon: "privacy", to: menu, search: { section: "legal" }, marker: "legal" },
      { en: "Blocked list", fr: "Liste des personnes bloquées", icon: "privacy", to: menu, search: { screen: "blocked" }, marker: "blocked" },
    ],
  };
}

export function PhoneCategoryMenu({ host }: { host: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const fr = locale === "fr";
  const groups = host ? hostGroups(pathname) : parentGroups(pathname, locale);
  const name = user?.displayName || user?.primaryEmail || t("account");
  return (
    <section className="ke-phone-cats" data-ke="phone-menu-groups">
      <header className="ke-phone-cats-title">
        <h1>{t("navMenu")}</h1>
        <NotificationBell />
      </header>
      <Link to={menuDeskPath(pathname)} search={{ screen: "account" }} className="ke-phone-cats-profile">
        <span aria-hidden="true">{(user?.displayName || "K").slice(0, 1).toUpperCase()}</span>
        <span>
          <strong>{name}</strong>
          <em>{fr ? "Voir le profil" : "View profile"}</em>
        </span>
      </Link>
      {groups.map((group) => (
        <nav key={group.en} aria-label={fr ? group.fr : group.en}>
          <h2>{fr ? group.fr : group.en}</h2>
          {group.rows.map((row) => (
            <MenuRow
              key={row.marker}
              to={row.to}
              search={row.search}
              label={fr ? row.fr : row.en}
              icon={row.icon}
              marker={`phone-${row.marker}`}
            />
          ))}
        </nav>
      ))}
      <RoleSwitchPill />
      {user ? (
        <div className="ke-phone-cats-actions" data-ke="menu-account-actions">
          <Link to={localePath("/delete-account", locale)} data-ke="menu-delete-account">
            {t("deleteAccount")}
          </Link>
          <button type="button" data-ke="menu-sign-out" onClick={() => void signOut("/")}>
            <MenuGlyph id="logout" />
            {t("signOut")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
