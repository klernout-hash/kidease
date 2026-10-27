import { Link } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { CountUp } from "@/components/count-up";
import { KidBlocks, KidStars } from "@/components/kid-art";
import { LanguageSelect } from "@/components/language-select";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { ShareKidEaseButton } from "@/components/share-button";
import { useRoleChrome } from "@/components/role-chrome";
import { useSessionDesks } from "@/components/session-desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { menuGroupLinks, menuHighlight, type MenuGroupId } from "@/lib/app-menu";
import { accountSearch, highlightDesk } from "@/lib/desks";
import { footerLinkLabel } from "@/lib/site-footer-nav";
import { localePath } from "@/lib/locale-path";
import { chartHasEarnings, insightsCardRating, monthTick, type HostEarnings, type HostInsights } from "@/lib/host-desk";
import { loadHostEarnings, loadHostInsights } from "@/lib/server/host-desk";
import type { CopyKey } from "@/lib/copy";
import type { MenuIconId } from "@/lib/menu-icons";
import { showStoreComingSoon } from "@/lib/store-placeholders";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useInNativeShell, useStoreChannel } from "@/lib/use-native-shell";
import { useMounted } from "@/lib/use-mounted";
import { useCopy } from "@/lib/use-copy";
import { MonthBars } from "@/components/month-bars";

const AppearanceControl = lazy(() =>
  import("@/components/appearance-control").then((m) => ({ default: m.AppearanceControl })),
);

const GROUP_COPY: Record<MenuGroupId, { title: CopyKey; icon: MenuIconId }> = {
  resources: { title: "menuResources", icon: "daycare" },
  guides: { title: "menuGuides", icon: "howItWorks" },
  help: { title: "menuGetHelp", icon: "help" },
  legal: { title: "menuPrivacyLegal", icon: "privacy" },
};

export function AppMenuScreen({
  section,
  earnings = null,
  insights = null,
}: {
  section?: MenuGroupId;
  earnings?: HostEarnings | null;
  insights?: HostInsights | null;
}) {
  const { t, locale } = useCopy();
  const chrome = useRoleChrome();
  const { user } = useCurrentUserState();
  const { session, sticky } = useSessionDesks();
  const native = useInNativeShell();
  const showStores = showStoreComingSoon(useStoreChannel());
  const plansOn = chrome.subscriptionsEnabled === true;
  const currentDesk = highlightDesk("/menu", sticky, null);
  const ownsCentre = Boolean(session?.ownsCentre);
  const highlight = menuHighlight({ role: chrome.role, ownsCentre, currentDesk });
  const hostCards = highlight === "create";

  if (section) {
    return (
      <main className="ke-menu-main ke-screen-enter ke-gutter mx-auto max-w-lg pb-10 pt-6" data-ke="app-menu" data-section={section}>
        <Link to="/menu" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {t("back")}
        </Link>
        <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">{t(GROUP_COPY[section].title)}</h1>
        <nav className="ke-menu-group mt-4" aria-label={t(GROUP_COPY[section].title)}>
          {menuGroupLinks(section, { native, plansOn })
            .filter((link) => link.to !== "/get-app" || showStores)
            .map((link) => (
            <MenuRow
              key={link.to}
              to={localePath(link.to, locale)}
              search={link.search}
              label={footerLinkLabel(link, t, locale)}
              icon={GROUP_COPY[section].icon}
              marker={link.to === "/get-app" ? "store-coming-soon" : `more-${link.to.replace(/^\//, "")}`}
            />
          ))}
        </nav>
      </main>
    );
  }

  return (
    <main className="ke-menu-main ke-screen-enter ke-gutter mx-auto max-w-lg pb-10 pt-6" data-ke="app-menu" data-role={chrome.role}>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">{t("navMenu")}</h1>
      {hostCards ? <HostCards initialEarnings={earnings} initialInsights={insights} /> : null}
      {highlight === "create" ? (
        <Link
          to="/provider"
          search={{ desk: "listings" }}
          hash="list-new"
          data-ke="menu-highlight"
          data-highlight="create"
          className="ke-press mt-6 flex min-h-24 items-center gap-3 rounded-[1.25rem] bg-primary px-5 py-5 text-primary-fg touch-manipulation"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-fg/15">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-lg font-semibold leading-snug">{t("menuCreateListing")}</span>
          <KidBlocks tone="onPrimary" className="h-12 w-20 shrink-0 text-primary-fg" />
        </Link>
      ) : (
        <Link
          to={localePath("/search", locale)}
          data-ke="menu-highlight"
          data-highlight="find"
          className="ke-press mt-6 flex min-h-24 items-center gap-3 rounded-[1.25rem] bg-primary px-5 py-5 text-primary-fg touch-manipulation"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-fg/15">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-lg font-semibold leading-snug">{t("menuFindDaycare")}</span>
          <KidBlocks tone="onPrimary" className="h-12 w-20 shrink-0 text-primary-fg" />
        </Link>
      )}

      <nav className="ke-menu-group mt-6" aria-label={t("navMenu")}>
        {user && highlight !== "create" ? (
          <MenuRow to="/menu" search={{ screen: "payments" }} label={t("earningsPayments")} icon="terms" marker="payments" />
        ) : null}
        <MenuRow
          to={user ? "/account" : localePath("/login", locale)}
          search={user ? accountSearch(sticky) : { next: "/account?tab=profile" }}
          label={t("menuAccountSettings")}
          icon={user ? "settings" : "login"}
          marker="account"
        />
        <MenuRow to="/menu" search={{ section: "resources" }} label={t("menuResources")} icon="daycare" marker="resources" />
        <MenuRow to="/menu" search={{ section: "guides" }} label={t("menuGuides")} icon="howItWorks" marker="guides" />
        <MenuRow to="/menu" search={{ section: "help" }} label={t("menuGetHelp")} icon="help" marker="help" />
        <MenuRow to="/menu" search={{ section: "legal" }} label={t("menuPrivacyLegal")} icon="privacy" marker="legal" />
        {plansOn && chrome.role === "provider" ? (
          <MenuRow to="/provider/subscription" label={t(chrome.paid ? "navMyPlan" : "navUpgrade")} icon="benefits" marker="upgrade" />
        ) : null}
        {plansOn && chrome.role === "parent" ? (
          <MenuRow
            to="/parent"
            search={{ tab: "subscription" }}
            label={t(chrome.paid ? "navMyPlan" : "navUpgrade")}
            icon="benefits"
            marker="upgrade"
          />
        ) : null}
        {plansOn && chrome.role !== "provider" && chrome.role !== "parent" ? (
          <MenuRow
            to={localePath("/plans", locale)}
            label={t("navUpgrade")}
            icon="benefits"
            marker="upgrade"
          />
        ) : null}
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-1">
          <span className="flex min-w-0 items-center gap-3 text-[15px] text-fg">
            <MenuGlyph id="language" />
            <span>{t("language")}</span>
          </span>
          <LanguageSelect />
        </div>
        <div className="flex min-h-14 items-center gap-3 border-b border-border px-1">
          <MenuGlyph id="appearance" />
          <div className="min-w-0 flex-1">
            <Suspense fallback={null}>
              <AppearanceControl />
            </Suspense>
          </div>
        </div>
        <ShareKidEaseButton appearance="row" />
      </nav>

      {user ? (
        <button
          type="button"
          onClick={() => void signOut("/")}
          className="mt-8 flex min-h-11 w-full items-center justify-center gap-3 rounded-full bg-fg px-4 py-3.5 text-sm font-semibold text-bg touch-manipulation"
        >
          <MenuGlyph id="logout" className="text-bg" />
          {t("signOut")}
        </button>
      ) : null}
    </main>
  );
}

function HostCards({
  initialEarnings = null,
  initialInsights = null,
}: {
  initialEarnings?: HostEarnings | null;
  initialInsights?: HostInsights | null;
}) {
  const { t, locale } = useCopy();
  const french = locale === "fr";
  const mounted = useMounted();
  const seeded = initialEarnings != null || initialInsights != null;
  const [settled, setSettled] = useState(seeded);
  const [earnings, setEarnings] = useState<HostEarnings | null>(initialEarnings);
  const [insights, setInsights] = useState<HostInsights | null>(initialInsights);

  useEffect(() => {
    if (seeded) return;
    let live = true;
    void Promise.all([loadHostEarnings().catch(() => null), loadHostInsights().catch(() => null)]).then(
      ([nextEarnings, nextInsights]) => {
        if (!live) return;
        setEarnings(nextEarnings);
        setInsights(nextInsights);
        setSettled(true);
      },
    );
    return () => {
      live = false;
    };
  }, [seeded]);

  const cad = (cents: number) => formatPlanCad(cents / 100, french ? "fr" : "en");
  const bars = earnings?.ok ? earnings.bars : [];
  const showChart = chartHasEarnings(bars);
  const rating = insights?.ok ? insightsCardRating(insights) : null;
  const cardClass =
    "ke-press flex min-h-36 flex-col justify-between gap-3 rounded-[1.25rem] bg-surface p-4 ring-1 ring-border touch-manipulation";
  const waiting = mounted && !settled;

  return (
    <div className="mt-6 grid grid-cols-2 gap-4" data-ke="menu-summary">
      <Link to="/menu" search={{ screen: "earnings" }} data-ke="menu-earnings" className={cardClass}>
        <span className="text-sm text-muted">{t("menuEarningsMonth")}</span>
        {earnings?.ok && typeof earnings.thisMonthCents === "number" ? (
          <CountUp value={earnings.thisMonthCents} format={cad} className="font-display text-2xl tabular-nums" />
        ) : earnings?.ok ? (
          <span className="flex items-end justify-between gap-2">
            <span className="min-w-0 text-sm font-medium leading-snug">{t("menuEarningsEmpty")}</span>
            <KidBlocks className="h-10 w-14 shrink-0 text-primary" />
          </span>
        ) : waiting ? (
          <span className="ke-skeleton block h-8 w-20 rounded-md" aria-hidden />
        ) : null}
        {showChart ? (
          <MonthBars
            bars={bars}
            compact
            label={`${t("earningsByMonth")}. ${bars.map((bar) => `${monthTick(bar.period, french)} ${cad(bar.cents)}`).join(", ")}`}
          />
        ) : null}
      </Link>
      <Link to="/menu" search={{ screen: "insights" }} data-ke="menu-insights" className={cardClass}>
        <span className="text-sm text-muted">{t("menuReviews")}</span>
        {rating ? (
          <span className="flex items-center gap-1.5 font-display text-2xl tabular-nums">
            <Star className="size-5 fill-current text-primary" aria-hidden />
            <CountUp value={rating.ratingX10} format={(n) => (n / 10).toFixed(1)} />
            <CountUp value={rating.reviewCount} format={(n) => `(${n})`} className="text-sm font-medium text-muted" />
          </span>
        ) : insights?.ok ? (
          <span className="flex items-end justify-between gap-2">
            <span className="min-w-0 text-sm font-medium leading-snug">{t("menuReviewsEmpty")}</span>
            <KidStars className="h-10 w-14 shrink-0" />
          </span>
        ) : waiting ? (
          <span className="ke-skeleton block h-8 w-16 rounded-md" aria-hidden />
        ) : null}
      </Link>
    </div>
  );
}
