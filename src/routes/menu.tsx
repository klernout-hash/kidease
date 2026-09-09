import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useSessionDesks } from "@/components/desk-switcher";
import { canSeeAdminDesk, canVisitDesk, showDeskSwitcher } from "@/lib/desks";

const ShareKidEaseButton = lazy(() =>
  import("@/components/share-button").then((m) => ({ default: m.ShareKidEaseButton })),
);
const RateKidEaseMenuRow = lazy(() =>
  import("@/components/rate-kidease").then((m) => ({ default: m.RateKidEaseMenuRow })),
);
const AppearanceControl = lazy(() =>
  import("@/components/appearance-control").then((m) => ({ default: m.AppearanceControl })),
);
const DeskSwitcher = lazy(() =>
  import("@/components/desk-switcher").then((m) => ({ default: m.DeskSwitcher })),
);

export const Route = createFileRoute("/menu")({
  component: MenuPage,
});

function Row({
  to,
  search,
  label,
  href,
}: {
  to?: string;
  search?: Record<string, string>;
  label: string;
  href?: string;
}) {
  const className =
    "flex min-h-14 items-center justify-between gap-3 border-b border-border px-1 text-[15px] text-fg last:border-b-0";
  const chevron = <span className="ke-menu-chevron" aria-hidden />;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
        {chevron}
      </a>
    );
  }
  return (
    <Link to={to ?? "/"} search={search} className={className}>
      {label}
      {chevron}
    </Link>
  );
}

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
  const multiDesk = Boolean(user && showDeskSwitcher(session?.desks, session?.role));
  const showAdmin = Boolean(
    user && canSeeAdminDesk(session?.role) && session && canVisitDesk(session.desks, "admin", session.role),
  );

  return (
    <Shell>
      <main className="ke-menu-main ke-gutter mx-auto max-w-lg pb-8 pt-5">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">
          {fr ? "Menu" : "Menu"}
        </h1>

        {multiDesk ? (
          <Group title={fr ? "Vos espaces" : "Your desks"}>
            <div className="px-1 py-2">
              <Suspense fallback={<div className="ke-skel h-11 rounded-full" aria-hidden="true" />}>
                <DeskSwitcher />
              </Suspense>
            </div>
          </Group>
        ) : null}

        {showAdmin ? (
          <Group title={fr ? "Équipe" : "Staff"}>
            <Row to="/admin" label={fr ? "Espace admin" : "Admin desk"} />
            {session?.desks.includes("support") ? (
              <Row to="/support" label={fr ? "Espace soutien" : "Support desk"} />
            ) : null}
          </Group>
        ) : null}

        <Group title={fr ? "Réglages" : "Settings"}>
          <div className="px-1 py-2">
            <Suspense fallback={<div className="ke-skel h-11 rounded-full" aria-hidden="true" />}>
              <AppearanceControl />
            </Suspense>
          </div>
        </Group>

        <Group title="KidEase" defer>
          <Row to="/search" label={t("explore")} />
          <Row to="/benefits" label={t("benefitsTab")} />
          <Row to="/get-app" label={t("getApp")} />
          <Suspense fallback={null}>
            <ShareKidEaseButton appearance="row" />
            <RateKidEaseMenuRow />
          </Suspense>
          <Row to="/about" label={t("about")} />
          <Row to="/team" label={t("team")} />
          <Row to="/contact" label={t("contact")} />
        </Group>

        <Group title="Parents" defer>
          <Row to="/login" search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }} label={t("parentSignIn")} />
          <Row to="/parent" label={fr ? "Espace parent" : "Parent desk"} />
          <Row to="/account" search={{ tab: "profile", desk: "parent" }} label={t("profile")} />
          <Row to="/tour-checklist" label={t("tourChecklist")} />
          <Row to="/compare" label={t("compare")} />
          <Row to="/parent" search={{ tab: "saved" }} label={t("saved")} />
        </Group>

        <Group title={fr ? "Garderies" : "Daycares"} defer>
          <Row to="/claim" label={t("claimCta")} />
          <Row to="/login" search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }} label={t("providerLogin")} />
          <Row to="/provider" label={fr ? "Espace garderie" : "Daycare desk"} />
          <Row to="/account" search={{ tab: "profile", desk: "director" }} label={t("account")} />
          <Row href="https://childcaresearch.gov.mb.ca/en" label={t("mbChildcare")} />
        </Group>

        <Group title={fr ? "Soutien" : "Support"} defer>
          <Row to="/help" label={fr ? "Centre d’aide" : "Help Centre"} />
          <Row to="/faq" label="FAQ" />
          <Row to="/how-it-works" label={t("howItWorksCta")} />
          <Row to="/privacy" label={t("privacy")} />
          <Row to="/terms" label={t("terms")} />
          <Row to="/cookies" label={t("cookies")} />
          <Row to="/account" label={t("deleteAccount")} />
        </Group>

        {user ? (
          <button
            type="button"
            onClick={() => void signOut("/")}
            className="mt-8 w-full rounded-full bg-fg px-4 py-3.5 text-sm font-semibold text-bg"
          >
            {t("signOut")}
          </button>
        ) : null}
      </main>
    </Shell>
  );
}
