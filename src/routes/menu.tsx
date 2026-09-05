import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { showDeskSwitcher } from "@/lib/desks";

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
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {label}
        <ChevronRight className="size-4 text-muted" />
      </a>
    );
  }
  return (
    <Link to={to ?? "/"} search={search} className={className}>
      {label}
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
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
  const multiDesk = Boolean(user && showDeskSwitcher(session?.desks));

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-lg pb-8 pt-5">
        <h1 className="font-display text-[1.75rem] tracking-[-0.03em]">{fr ? "Menu" : "Menu"}</h1>

        {multiDesk ? (
          <Group title={fr ? "Vos espaces" : "Your desks"}>
            <div className="px-1 py-2">
              <DeskSwitcher />
            </div>
          </Group>
        ) : null}

        <Group title="KidEase">
          <Row to="/search" label={t("explore")} />
          <Row to="/benefits" label={t("benefitsTab")} />
          <Row to="/get-app" label={t("getApp")} />
          <Row to="/about" label={t("about")} />
          <Row to="/team" label={t("team")} />
          <Row to="/contact" label={t("contact")} />
        </Group>

        <Group title={fr ? "Soutien" : "Support"}>
          <Row to="/support" label={fr ? "Centre d’aide" : "Help Centre"} />
          <Row to="/faq" label="FAQ" />
          <Row to="/how-it-works" label={t("howItWorksCta")} />
          <Row to="/privacy" label={t("privacy")} />
          <Row to="/terms" label={t("terms")} />
          <Row to="/cookies" label={t("cookies")} />
          <Row to="/account" label={t("deleteAccount")} />
        </Group>

        <Group title="Parents">
          <Row to="/login" search={{ role: "parent", intent: "in", next: "/parent" }} label={t("parentSignIn")} />
          <Row to="/parent" label={fr ? "Espace parent" : "Parent desk"} />
          <Row to="/account" search={{ tab: "profile" }} label={t("profile")} />
          <Row to="/tour-checklist" label={t("tourChecklist")} />
          <Row to="/compare" label={t("compare")} />
          <Row to="/account" search={{ tab: "saved" }} label={t("saved")} />
        </Group>

        <Group title={fr ? "Garderies" : "Daycares"}>
          <Row to="/claim" label={t("claimCta")} />
          <Row to="/login" search={{ role: "provider", intent: "in", next: "/provider" }} label={t("providerLogin")} />
          <Row to="/provider" label={fr ? "Espace garderie" : "Daycare desk"} />
          <Row href="https://childcaresearch.gov.mb.ca/en" label={t("mbChildcare")} />
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
