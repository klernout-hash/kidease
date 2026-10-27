import { companyOperatorLine } from "@/lib/company";
import { footerLinkLabel, footerLinksForShell } from "@/lib/site-footer-nav";
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
  const hidden = new Set(omit);
  const links = footerLinksForShell({ native, plansOn }).filter((link) => !hidden.has(link.to));
  const fr = locale === "fr";
  const title = fr ? "Plus" : "More";
  const List = appearance === "drawer" ? "div" : "nav";

  return (
    <section data-ke="footer-more" data-role={chrome.role} className={appearance === "page" ? "mt-8" : "mt-2"}>
      <h2 className={appearance === "page" ? "px-1 text-sm font-semibold text-fg" : "px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle"}>
        {title}
      </h2>
      <List aria-label={title} data-ke="mobile-menu-links" role={appearance === "drawer" ? "navigation" : undefined}>
        {links.map((link) => (
          <MenuRow
            key={link.to}
            to={localePath(link.to, locale)}
            label={footerLinkLabel(link, t, locale)}
            icon={ICONS[link.to] ?? "help"}
            appearance={appearance}
            marker={`more-${link.to.replace(/^\//, "") || "home"}`}
            onClick={onNavigate}
          />
        ))}
        {share ? <ShareKidEaseButton appearance={appearance === "drawer" ? "drawer" : "row"} onDone={onNavigate} /> : null}
        {appearance === "page" ? (
          <div className="mt-3 flex min-h-11 items-center gap-3 px-1">
            <LanguageSelect className="w-full justify-start" />
          </div>
        ) : null}
      </List>
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
