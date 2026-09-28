import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { MenuAccordion } from "@/components/menu-accordion";
import { NotificationUnreadDot } from "@/components/notification-bell";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { failClosedUnread } from "@/lib/notifications";
import { useSessionDesks } from "@/components/session-desks";
import { ShareKidEaseButton } from "@/components/share-button";
import { RoleNavLinks } from "@/components/role-nav";
import { useRoleChrome } from "@/components/role-chrome";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);
const MenuListingShortcuts = lazy(() =>
  import("@/components/menu-listing-shortcuts").then((m) => ({ default: m.MenuListingShortcuts })),
);
const RateKidEaseMenuRow = lazy(() =>
  import("@/components/rate-kidease").then((m) => ({ default: m.RateKidEaseMenuRow })),
);
const AppearanceControl = lazy(() =>
  import("@/components/appearance-control").then((m) => ({ default: m.AppearanceControl })),
);

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu · KidEase" },
      { name: "description", content: "Settings, desks, and support on KidEase." },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const { session } = useSessionDesks();
  const chrome = useRoleChrome();
  const fr = locale === "fr";
  const unread = failClosedUnread(session?.notificationUnread);
  const deskUser =
    !chrome.pending && (chrome.role === "parent" || chrome.role === "provider" || chrome.role === "admin");
  const showGuestDesks = !chrome.pending && chrome.role === "guest";
  const showDaycareDesk = !chrome.pending && (chrome.role === "provider" || chrome.role === "admin");
  const name = user?.displayName?.trim() || user?.primaryEmail || (fr ? "Compte" : "Account");

  return (
    <ShellLite appTabs>
      <main className="ke-menu-main ke-gutter mx-auto max-w-lg pb-8 pt-5">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">
          {fr ? "Menu" : "Menu"}
        </h1>

        {user ? (
          <Link
            to="/account"
            search={{ tab: "profile" }}
            className="mt-4 flex items-center gap-3 rounded-2xl bg-surface px-3 py-3 no-underline ring-1 ring-border"
            data-ke="menu-profile"
          >
            {user.profileImageUrl ? (
              <img src={user.profileImageUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-bg text-sm font-semibold text-fg ring-1 ring-border">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-semibold text-fg">{name}</span>
              {user.primaryEmail ? (
                <span className="block truncate text-xs text-muted">{user.primaryEmail}</span>
              ) : null}
            </span>
          </Link>
        ) : null}

        {showDaycareDesk ? (
          <Suspense fallback={null}>
            <MenuListingShortcuts />
          </Suspense>
        ) : null}

        {user ? (
          <Suspense fallback={null}>
            <MenuDeskTools />
          </Suspense>
        ) : null}

        {deskUser ? null : chrome.pending ? null : (
          <RoleNavLinks role={chrome.role} paid={chrome.paid} appearance="menu" />
        )}

        {user ? (
          <div className="mt-5">
            <MenuRow
              to="/notifications"
              label={t("notifications")}
              icon="notifications"
              badge={<NotificationUnreadDot unread={unread} />}
            />
          </div>
        ) : null}

        {showGuestDesks ? (
          <div className="mt-4">
            <MenuRow
              to="/login"
              search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}
              label={t("parentSignIn")}
              icon="login"
            />
            <MenuRow to="/tour-checklist" label={t("tourChecklist")} icon="tourChecklist" />
            <MenuRow to="/compare" label={t("compare")} icon="compare" />
            <MenuRow to="/claim" label={t("claimCta")} icon="claim" />
            <MenuRow
              to="/login"
              search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}
              label={t("providerLogin")}
              icon="login"
            />
            <MenuRow to="/jobs" label={t("findDaycareJobs")} icon="jobs" />
          </div>
        ) : null}

        <div className="mt-6 border-t border-border pt-1">
          <MenuAccordion title={fr ? "Aide et assistance" : "Help and support"} icon="help">
            <MenuRow to="/help" label={fr ? "Centre d’aide" : "Help Centre"} icon="help" />
            <MenuRow to="/faq" label="FAQ" icon="faq" />
            <MenuRow to="/how-it-works" label={t("howItWorksCta")} icon="howItWorks" />
            <MenuRow to="/jobs/post" label={t("addJobsAtKidEase")} icon="jobs" />
            <MenuRow to="/verify" label={t("verifyListings")} icon="verify" />
            <MenuRow to="/daycare-requirements" label={t("daycareRequirements")} icon="verify" />
          </MenuAccordion>

          <MenuAccordion title={fr ? "Paramètres et confidentialité" : "Settings and privacy"} icon="settings">
            <div className="flex items-center gap-3 px-1 py-2">
              <MenuGlyph id="appearance" />
              <div className="flex-1">
                <Suspense fallback={<div className="ke-skel h-11 rounded-full" aria-hidden="true" />}>
                  <AppearanceControl />
                </Suspense>
              </div>
            </div>
            <MenuRow to="/privacy" label={t("privacy")} icon="privacy" />
            <MenuRow to="/terms" label={t("terms")} icon="terms" />
            <MenuRow to="/cookies" label={t("cookies")} icon="cookies" />
          </MenuAccordion>

          <MenuAccordion title="KidEase" icon="about">
            <MenuRow to="/search" label={t("explore")} icon="explore" />
            <MenuRow to="/benefits" label={t("benefitsTab")} icon="benefits" />
            <MenuRow to="/get-app" label={t("getApp")} icon="getApp" />
            <ShareKidEaseButton appearance="row" />
            <Suspense fallback={null}>
              <RateKidEaseMenuRow />
            </Suspense>
            <MenuRow to="/about" label={t("about")} icon="about" />
            <MenuRow to="/start-a-daycare" label={t("startADaycare")} icon="startDaycare" />
            <MenuRow to="/donate" label={t("donateToKids")} icon="donate" />
            <MenuRow to="/team" label={t("team")} icon="team" />
            <MenuRow to="/contact" label={t("contact")} icon="contact" />
          </MenuAccordion>
        </div>

        {user ? (
          <button
            type="button"
            onClick={() => void signOut("/")}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-fg px-4 py-3.5 text-sm font-semibold text-bg"
          >
            <MenuGlyph id="logout" className="text-bg" />
            {t("signOut")}
          </button>
        ) : null}
      </main>
    </ShellLite>
  );
}
