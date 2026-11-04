import { companyOperatorLine } from "@/lib/company";
import {
  FOOTER_DAYCARES,
  FOOTER_KIDEASE,
  FOOTER_LEGAL,
  FOOTER_PARENTS,
  FOOTER_SUPPORT,
  footerLinkLabel,
  footerLinksForShell,
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
  const show = (links: readonly FooterLinkDef[]) =>
    footerLinksForShell({ native, plansOn }, links).filter((link) => !hidden.has(link.to));
  const fr = locale === "fr";
  const groups = [
    { id: "find", title: t("navFindCare"), links: show(FOOTER_PARENTS) },
    { id: "daycares", title: t("navForDaycares"), links: show(FOOTER_DAYCARES) },
    { id: "help", title: t("menuGetHelp"), links: show(FOOTER_SUPPORT) },
    { id: "about", title: t("about"), links: show(FOOTER_KIDEASE) },
    { id: "legal", title: t("menuPrivacyLegal"), links: show(FOOTER_LEGAL) },
  ].filter((group) => group.links.length > 0);

  if (appearance === "drawer") {
    return (
      <section data-ke="footer-more" data-role={chrome.role} className="mt-2">
        {groups.map((group) => (
          <details key={group.id} className="py-0.5" data-ke={`drawer-more-${group.id}`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-xs font-semibold uppercase tracking-normal text-subtle [&::-webkit-details-marker]:hidden">
              {group.title}
            </summary>
            <div data-ke="mobile-menu-links">
              {group.links.map((link) => (
                <MenuRow
                  key={link.to}
                  to={localePath(link.to, locale)}
                  label={footerLinkLabel(link, t, locale)}
                  icon={ICONS[link.to] ?? "help"}
                  appearance="drawer"
                  marker={`more-${link.to.replace(/^\//, "") || "home"}`}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </details>
        ))}
        {share ? <ShareKidEaseButton appearance="drawer" onDone={onNavigate} /> : null}
      </section>
    );
  }

  const links = groups.flatMap((group) => group.links);
  const title = fr ? "Plus" : "More";
  const List = "nav";

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
