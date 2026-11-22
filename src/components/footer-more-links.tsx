import { companyOperatorLine } from "@/lib/company";
import {
  footerLinkLabel,
  footerMenuGroupsForShell,
  type FooterLinkDef,
} from "@/lib/site-footer-nav";
import { localePath } from "@/lib/locale-path";
import { STORE } from "@/lib/store-listing";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";
import { useRoleChrome } from "@/components/role-chrome";
import { MenuRow } from "@/components/menu-row";
import { ShareKidEaseButton } from "@/components/share-button";
import { LanguageSelect } from "@/components/language-select";
import type { MenuIconId } from "@/lib/menu-icons";

const ICONS: Record<string, MenuIconId> = {
  "/search": "explore",
  "/cities": "explore",
  "/compare": "compare",
  "/tour-checklist": "tourChecklist",
  "/benefits": "benefits",
  "/claim": "claim",
  "/plans": "benefits",
  "/verify": "verify",
  "/daycare-requirements": "verify",
  "/start-a-daycare": "startDaycare",
  "/jobs": "jobs",
  "/about": "about",
  "/team": "team",
  "/donate": "donate",
  "/get-app": "getApp",
  "/help": "help",
  "/faq": "faq",
  "/how-it-works": "howItWorks",
  "/contact": "contact",
  "/report": "support",
  "/privacy": "privacy",
  "/terms": "terms",
  "/cookies": "cookies",
};

/** The same link labels, destinations, and icons in each drawer group. */
export function FooterMenuLinks({
  links,
  appearance,
  onNavigate,
}: {
  links: readonly FooterLinkDef[];
  appearance: "page" | "drawer";
  onNavigate?: () => void;
}) {
  const { t, locale } = useCopy();
  return <>{links.map((link) => (
    <MenuRow
      key={`${link.to}|${JSON.stringify(link.search ?? {})}`}
      to={localePath(link.to, locale)}
      search={link.search}
      label={footerLinkLabel(link, t, locale)}
      icon={ICONS[link.to] ?? "help"}
      appearance={appearance}
      marker={appearance === "drawer" && link.to === "/search"
        ? link.search?.view === "map" ? "map" : "search"
        : `more-${link.to.replace(/^\//, "") || "home"}`}
      onClick={onNavigate}
    />
  ))}</>;
}

/**
 * Every footer page, for the phone menu and the account screen.
 * Signed-out visitors have no account tab, so the hamburger uses this too.
 */
export function FooterMoreLinks({
  appearance = "page",
  onNavigate,
  omit = [],
  share = true,
}: {
  appearance?: "page" | "drawer";
  onNavigate?: () => void;
  /** Hrefs already shown higher in the same menu. */
  omit?: readonly string[];
  share?: boolean;
}) {
  const { t, locale } = useCopy();
  const native = useInNativeShell();
  const chrome = useRoleChrome();
  const plansOn = !native && chrome.subscriptionsEnabled === true;
  const fr = locale === "fr";
  const groups = footerMenuGroupsForShell({ native, plansOn, omit });

  if (appearance === "drawer") {
    return (
      <section data-ke="footer-more" data-role={chrome.role} className="mt-2">
        {groups.map((group) => (
          <details key={group.id} className="py-0.5" data-ke={`drawer-more-${group.id}`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-xs font-semibold uppercase tracking-normal text-subtle [&::-webkit-details-marker]:hidden">
              {t(group.titleKey)}
            </summary>
            <div data-ke="mobile-menu-links">
              <FooterMenuLinks links={group.links} appearance="drawer" onNavigate={onNavigate} />
            </div>
          </details>
        ))}
        {share ? <ShareKidEaseButton appearance="drawer" onDone={onNavigate} /> : null}
      </section>
    );
  }

  const links = groups.flatMap((group) => group.links);
  const title = fr ? "Plus" : "More";

  return (
    <section data-ke="footer-more" data-role={chrome.role} className="mt-8">
      <h2 className="px-1 text-sm font-semibold text-fg">
        {title}
      </h2>
      <nav aria-label={title} data-ke="mobile-menu-links">
        <FooterMenuLinks links={links} appearance="page" onNavigate={onNavigate} />
        {share ? <ShareKidEaseButton appearance="row" onDone={onNavigate} /> : null}
        <div className="mt-3 flex min-h-11 items-center gap-3 px-1">
          <LanguageSelect className="w-full justify-start" />
        </div>
      </nav>
      <p className="mt-4 px-1 text-xs leading-5 text-subtle" data-ke="more-company">
        © {new Date().getFullYear()} KidEase
        <span aria-hidden> · </span>
        {t("footerCopy")}
      </p>
      <p className="mt-1 px-1 text-xs leading-5 text-subtle">{companyOperatorLine(fr ? "fr" : "en")}</p>
      <p className="mt-1 px-1 text-xs text-subtle">
        {fr ? "Version de l’app" : "App version"} {STORE.version} ({STORE.build})
      </p>
    </section>
  );
}
