import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { companyOperatorLine } from "@/lib/company";
import { localePath } from "@/lib/locale-path";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { openCookieSettings } from "@/lib/prompt-manager";
import { HeaderSocial } from "@/components/header-social";
import { useRoleChrome } from "@/components/role-chrome";
import type { ChromeRole } from "@/lib/role-access";
import { FooterAppBadges } from "@/components/footer-app-badges";
import { LanguageSelect } from "@/components/language-select";
import { isStorePurchasePath } from "@/lib/store-purchase-copy";
import { useInNativeShell } from "@/lib/use-native-shell";
import { ShareKidEaseButton } from "@/components/share-button";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  footerLinkLabel,
  type FooterColumnId,
  type FooterLinkDef,
} from "@/lib/site-footer-nav";
import { showGovFooterLink } from "@/lib/gov/access";

function Item({
  to,
  search,
  children,
}: {
  to: string;
  search?: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link to={to} search={search} className="ke-footer-link">
        {children}
      </Link>
    </li>
  );
}

function isPlansPath(to: string): boolean {
  const bare = String(to || "").split("?")[0].replace(/\/$/, "") || "/";
  return bare === "/plans" || bare === "/fr/plans" || bare === "/pricing" || bare === "/fr/pricing";
}

function footerLinks(links: FooterLinkDef[], hideCommerce: boolean, hidePlans: boolean): FooterLinkDef[] {
  return links.filter((link) => {
    if (hideCommerce && isStorePurchasePath(link.to)) return false;
    if (hidePlans && isPlansPath(link.to)) return false;
    return true;
  });
}

function isSignInLink(link: FooterLinkDef): boolean {
  return link.to === "/login" || link.to === "/fr/login" || link.labelKey === "parentSignIn" || link.labelKey === "providerLogin";
}

function linksForRole(
  links: readonly FooterLinkDef[],
  role: ChromeRole,
  column: FooterColumnId,
  hideSignIn: boolean,
): FooterLinkDef[] {
  if (role === "provider" && column === "parents") return [];
  if (role === "parent" && column === "daycares") return [];
  return links.filter((link) => {
    if (hideSignIn && isSignInLink(link)) return false;
    if (role === "guest" && (link.to === "/parent" || link.to === "/provider")) return false;
    if (role === "parent" && (link.to.startsWith("/provider") || link.search?.role === "provider")) return false;
    if (role === "provider" && (link.to.startsWith("/parent") || link.search?.role === "parent")) return false;
    return true;
  });
}

function Column({
  id,
  title,
  links,
  locale,
  t,
}: {
  id: FooterColumnId;
  title: string;
  links: readonly FooterLinkDef[];
  locale: string;
  t: (key: CopyKey) => string;
}) {
  const sectionRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const wide = window.matchMedia("(min-width: 640px)");
    const sync = () => {
      section.open = wide.matches;
    };
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
  }, [links.length]);
  if (links.length === 0) return null;
  const labeled = links.map((link) => ({
    ...link,
    href: localePath(link.to, locale),
    label: footerLinkLabel(link, t, locale),
  }));
  const sorted = labeled;

  return (
    <details ref={sectionRef} open className="ke-footer-column" data-footer-col={id}>
      <summary className="ke-footer-title ke-footer-toggle touch-manipulation">
        {title}
        <ChevronDown className="size-4" aria-hidden="true" />
      </summary>
      <ul className="ke-footer-list">
        {sorted.map((link) => (
          <Item
            key={`${link.href}|${JSON.stringify(link.search ?? {})}|${link.label}`}
            to={link.href}
            search={link.search}
          >
            {link.label}
          </Item>
        ))}
      </ul>
    </details>
  );
}

export function SiteFooter() {
  const { t, locale } = useCopy();
  const chrome = useRoleChrome();
  const hideCommerce = useInNativeShell();
  const hidePlans = chrome.subscriptionsEnabled !== true;
  const fr = locale === "fr";
  const helpAndKidEase = [...FOOTER_COLUMNS.support, ...FOOTER_COLUMNS.kidease]
    .filter((link) => link.to !== "/get-app");

  return (
    <footer className="ke-site-footer mt-auto">
      <div className="ke-gutter">
        <div className="ke-footer-inner">
          <nav className="ke-footer-cols" aria-label="KidEase">
            <Column
              id="parents"
              title="Parents"
              links={footerLinks(linksForRole(FOOTER_COLUMNS.parents, chrome.role, "parents", chrome.pending || chrome.role !== "guest"), hideCommerce, hidePlans)}
              locale={locale}
              t={t}
            />
            <Column
              id="daycares"
              title={fr ? "Garderies" : "Daycares"}
              links={footerLinks(linksForRole(FOOTER_COLUMNS.daycares, chrome.role, "daycares", chrome.pending || chrome.role !== "guest"), hideCommerce, hidePlans)}
              locale={locale}
              t={t}
            />
            <Column id="support" title={fr ? "Aide et KidEase" : "Help & KidEase"} links={footerLinks(linksForRole(helpAndKidEase, chrome.role, "support", chrome.pending || chrome.role !== "guest"), hideCommerce, hidePlans)} locale={locale} t={t} />
          </nav>
          <div className="ke-footer-app-row">
            <FooterAppBadges />
            <div className="ke-footer-actions">
              <ShareKidEaseButton appearance="labeled" />
              <HeaderSocial always />
            </div>
          </div>
          <div className="ke-footer-legal">
            <p>© {new Date().getFullYear()} KidEase · {t("footerCopy")}</p>
            <nav className="ke-footer-legal-links" aria-label={fr ? "Confidentialité et conditions" : "Privacy and terms"}>
              {FOOTER_LEGAL.map((link) => (
                <Link
                  key={link.to}
                  to={localePath(link.to, locale)}
                  className="ke-footer-link inline-flex min-h-[44px] items-center"
                >
                  {footerLinkLabel(link, t, locale)}
                </Link>
              ))}
              <button type="button" data-ke="cookie-settings-link" className="ke-footer-link touch-manipulation" onClick={openCookieSettings}>
                {t("cookieSettings")}
              </button>
              {showGovFooterLink({ enabled: chrome.govPortalLink, native: hideCommerce }) ? (
                <Link to={fr ? "/fr/gov/login" : "/gov/login"} className="ke-footer-link">
                  {fr ? "Connexion gouvernement" : "Government sign-in"}
                </Link>
              ) : null}
            </nav>
            <LanguageSelect pill />
          </div>
          <details className="ke-footer-sources" data-ke="data-sources">
            <summary className="ke-footer-link cursor-pointer">{t("dataSourcesTitle")}</summary>
            <p>{t("dataSourcesBody")}</p>
            <p>{t("neverSell")}</p>
            <p data-ke="company-operator">{companyOperatorLine(fr ? "fr" : "en")}</p>
          </details>
        </div>
      </div>
    </footer>
  );
}
