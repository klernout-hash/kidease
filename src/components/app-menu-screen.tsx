import { Link } from "@tanstack/react-router";
import { Plus, Star } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
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
import type { MenuProviderCards } from "@/lib/server/menu-summary";
import { loadMenuProviderCards } from "@/lib/server/menu-summary";
import type { CopyKey } from "@/lib/copy";
import type { MenuIconId } from "@/lib/menu-icons";
import { centsToDollars } from "@/lib/bill";
import { showStoreComingSoon } from "@/lib/store-placeholders";
import { useInNativeShell, useStoreChannel } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";

const AppearanceControl = lazy(() =>
  import("@/components/appearance-control").then((m) => ({ default: m.AppearanceControl })),
);

const GROUP_COPY: Record<MenuGroupId, { title: CopyKey; icon: MenuIconId }> = {
  resources: { title: "menuResources", icon: "daycare" },
  guides: { title: "menuGuides", icon: "howItWorks" },
  help: { title: "menuGetHelp", icon: "help" },
  legal: { title: "menuPrivacyLegal", icon: "privacy" },
};

export function AppMenuScreen({ section }: { section?: MenuGroupId }) {
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
      <main className="ke-menu-main ke-gutter mx-auto max-w-lg pb-8 pt-5" data-ke="app-menu" data-section={section}>
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
    <main className="ke-menu-main ke-gutter mx-auto max-w-lg pb-8 pt-5" data-ke="app-menu" data-role={chrome.role}>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.03em] [font-family:system-ui,Segoe_UI,sans-serif]">{t("navMenu")}</h1>
      {hostCards ? <HostCards /> : null}
      {highlight === "create" ? (
        <Link
          to="/provider"
          search={{ desk: "listings" }}
          hash="list-new"
          data-ke="menu-highlight"
          data-highlight="create"
          className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-fg touch-manipulation"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-fg/15">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold leading-snug">{t("menuCreateListing")}</span>
        </Link>
      ) : (
        <Link
          to={localePath("/search", locale)}
          data-ke="menu-highlight"
          data-highlight="find"
          className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-fg touch-manipulation"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-fg/15">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold leading-snug">{t("menuFindDaycare")}</span>
        </Link>
      )}

      <nav className="ke-menu-group mt-6" aria-label={t("navMenu")}>
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

function HostCards() {
  const { t, locale } = useCopy();
  const [cards, setCards] = useState<MenuProviderCards | null>(null);

  useEffect(() => {
    let live = true;
    void loadMenuProviderCards()
      .then((next) => {
        if (live) setCards(next);
      })
      .catch(() => {
        if (live) setCards(null);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!cards) return null;
  const earnings = cards.earningsCents;
  const rating = cards.ratingX10;
  const count = cards.reviewCount;
  const showEarnings = typeof earnings === "number";
  const showReviews = typeof rating === "number" && typeof count === "number" && count > 0;
  if (!showEarnings && !showReviews) return null;

  return (
    <div className={`mt-5 grid gap-3 ${showEarnings && showReviews ? "grid-cols-2" : "grid-cols-1"}`} data-ke="menu-summary">
      {showEarnings ? (
        <Link
          to="/provider"
          search={{ desk: "money" }}
          data-ke="menu-earnings"
          className="flex min-h-24 flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-border"
        >
          <span className="text-sm text-muted">{t("menuEarningsMonth")}</span>
          <span className="font-display text-2xl tabular-nums">{money(centsToDollars(earnings), locale)}</span>
        </Link>
      ) : null}
      {showReviews ? <ReviewCard ratingX10={rating} reviewCount={count} slug={cards.reviewSlug} /> : null}
    </div>
  );
}

function ReviewCard({
  ratingX10,
  reviewCount,
  slug,
}: {
  ratingX10: number;
  reviewCount: number;
  slug: string | null;
}) {
  const { t } = useCopy();
  const body = (
    <>
      <span className="text-sm text-muted">{t("menuReviews")}</span>
      <span className="flex items-center gap-1.5 font-display text-2xl tabular-nums">
        <Star className="size-5 fill-current text-primary" aria-hidden />
        {(ratingX10 / 10).toFixed(1)}
        <span className="text-sm font-medium text-muted">({reviewCount})</span>
      </span>
    </>
  );
  const className = "flex min-h-24 flex-col justify-between rounded-2xl bg-surface p-4 ring-1 ring-border";
  if (slug) {
    return (
      <Link to="/daycare/$slug" params={{ slug }} data-ke="menu-reviews" className={className}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/provider" search={{ desk: "listings" }} data-ke="menu-reviews" className={className}>
      {body}
    </Link>
  );
}
