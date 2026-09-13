import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ShellLite } from "@/components/shell-lite";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { NotificationUnreadDot } from "@/components/notification-bell";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { failClosedUnread } from "@/lib/notifications";
import { useSessionDesks } from "@/components/session-desks";

const MenuDeskTools = lazy(() =>
  import("@/components/menu-desk-tools").then((m) => ({ default: m.MenuDeskTools })),
);

const ShareKidEaseButton = lazy(() =>
  import("@/components/share-button").then((m) => ({ default: m.ShareKidEaseButton })),
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

function Group({
  title,
  children,
  defer = false,
}: {
  title: string;
  children: React.ReactNode;
  defer?: boolean;
}) {
  return (
    <section className={defer ? "ke-menu-group mt-7" : "mt-7"}>
      <h2 className="px-1 text-[15px] font-bold text-fg">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function MenuPage() {
  const { t, locale } = useCopy();
  const { user } = useCurrentUserState();
  const { session } = useSessionDesks();
  const fr = locale === "fr";
  const unread = failClosedUnread(session?.notificationUnread);

  return (
    <ShellLite appTabs>
      <main className="ke-menu-main ke-gutter mx-auto max-w-lg pb-8 pt-5">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">
          {fr ? "Menu" : "Menu"}
        </h1>

        {user ? (
          <Group title={t("notifications")}>
            <MenuRow
              to="/notifications"
              label={t("notifications")}
              icon="notifications"
              badge={<NotificationUnreadDot unread={unread} />}
            />
          </Group>
        ) : null}

        {user ? (
          <Suspense fallback={null}>
            <MenuDeskTools />
          </Suspense>
        ) : null}

        <Group title={t("settings")}>
          <div className="flex items-center gap-3 px-1 py-2">
            <MenuGlyph id="appearance" />
            <div className="flex-1">
              <Suspense fallback={<div className="ke-skel h-11 rounded-full" aria-hidden="true" />}>
                <AppearanceControl />
              </Suspense>
            </div>
          </div>
        </Group>

        <Group title="KidEase" defer>
          <MenuRow to="/search" label={t("explore")} icon="explore" />
          <MenuRow to="/benefits" label={t("benefitsTab")} icon="benefits" />
          <MenuRow to="/get-app" label={t("getApp")} icon="getApp" />
          <Suspense fallback={null}>
            <ShareKidEaseButton appearance="row" />
            <RateKidEaseMenuRow />
          </Suspense>
          <MenuRow to="/about" label={t("about")} icon="about" />
          <MenuRow to="/team" label={t("team")} icon="team" />
          <MenuRow to="/contact" label={t("contact")} icon="contact" />
        </Group>

        <Group title="Parents" defer>
          <MenuRow
            to="/login"
            search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}
            label={t("parentSignIn")}
            icon="login"
          />
          <MenuRow to="/parent" label={t("parentDesk")} icon="parent" />
          <MenuRow to="/account" search={{ tab: "profile", desk: "parent" }} label={t("profile")} icon="profile" />
          <MenuRow to="/tour-checklist" label={t("tourChecklist")} icon="tourChecklist" />
          <MenuRow to="/compare" label={t("compare")} icon="compare" />
          <MenuRow to="/parent" search={{ tab: "saved" }} label={t("saved")} icon="saved" />
        </Group>

        <Group title={fr ? "Garderies" : "Daycares"} defer>
          <MenuRow to="/claim" label={t("claimCta")} icon="claim" />
          <MenuRow
            to="/login"
            search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}
            label={t("providerLogin")}
            icon="login"
          />
          <MenuRow to="/provider" label={t("daycareDesk")} icon="daycare" />
          <MenuRow to="/account" search={{ tab: "profile", desk: "director" }} label={t("account")} icon="account" />
          <MenuRow href="https://childcaresearch.gov.mb.ca/en" label={t("mbChildcare")} icon="verify" />
          <MenuRow to="/jobs" label={t("findDaycareJobs")} icon="jobs" />
        </Group>

        <Group title={t("footerCaregivers")} defer>
          <MenuRow to="/jobs" label={t("findDaycareJobs")} icon="jobs" />
        </Group>

        <Group title={fr ? "Soutien" : "Support"} defer>
          <MenuRow to="/help" label={fr ? "Centre d’aide" : "Help Centre"} icon="help" />
          <MenuRow to="/faq" label="FAQ" icon="faq" />
          <MenuRow to="/how-it-works" label={t("howItWorksCta")} icon="howItWorks" />
          <MenuRow to="/jobs/post" label={t("addJobsAtKidEase")} icon="jobs" />
          <MenuRow to="/verify" label={t("verifyListings")} icon="verify" />
          <MenuRow to="/daycare-requirements" label={t("daycareRequirements")} icon="verify" />
          <MenuRow to="/privacy" label={t("privacy")} icon="privacy" />
          <MenuRow to="/terms" label={t("terms")} icon="terms" />
          <MenuRow to="/cookies" label={t("cookies")} icon="cookies" />
          <MenuRow to="/delete-account" label={t("deleteAccount")} icon="deleteAccount" />
        </Group>

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
