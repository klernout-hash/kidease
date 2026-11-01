import { Link } from "@tanstack/react-router";
import { companyOperatorLine } from "@/lib/company";
import { localePath } from "@/lib/locale-path";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HeaderSocial } from "@/components/header-social";
import { useRoleChrome } from "@/components/role-chrome";
import type { ChromeRole } from "@/lib/role-access";
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
  if (links.length === 0) return null;
  const labeled = links.map((link) => ({
    ...link,
    href: localePath(link.to, locale),
    label: footerLinkLabel(link, t, locale),
  }));
  const sorted = labeled;

  return (
    <section data-footer-col={id}>
      <p className="ke-footer-title">{title}</p>
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
    </section>
  );
}

export function SiteFooter() {
  const { t, locale } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const chrome = useRoleChrome();
  const hideCommerce = useInNativeShell();
  const hidePlans = chrome.subscriptionsEnabled !== true;
  const fr = locale === "fr";
  // Operator sign-in is not linked from the public footer. Kyle uses /login.
  void isPending;
  void isKidEaseOperatorEmail(user?.primaryEmail);

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
            <Column id="support" title={t("support")} links={footerLinks(linksForRole(FOOTER_COLUMNS.support, chrome.role, "support", chrome.pending || chrome.role !== "guest"), hideCommerce, hidePlans)} locale={locale} t={t} />
            <Column id="kidease" title={t("app")} links={footerLinks(linksForRole(FOOTER_COLUMNS.kidease, chrome.role, "kidease", chrome.pending || chrome.role !== "guest"), hideCommerce, hidePlans)} locale={locale} t={t} />
          </nav>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {FOOTER_LEGAL.map((link) => (
                <Link
                  key={link.to}
                  to={localePath(link.to, locale)}
                  className="ke-footer-link inline-flex min-h-11 items-center"
                >
                  {footerLinkLabel(link, t, locale)}
                </Link>
              ))}
            </div>
            <LanguageSelect pill />
          </div>
          {showGovFooterLink({ enabled: chrome.govPortalLink, native: hideCommerce }) ? (
            <p className="mt-2">
              <Link
                to={fr ? "/fr/gov/login" : "/gov/login"}
                className="ke-footer-link inline-flex min-h-11 items-center text-sm"
              >
                {fr ? "Pour les gouvernements" : "For governments"}
              </Link>
            </p>
          ) : null}

          <div className="ke-footer-legal">
            <div className="ke-footer-legal-copy">
              <p>
                © {new Date().getFullYear()} KidEase
                <span className="mx-1.5 text-subtle" aria-hidden>
                  ·
                </span>
                {t("footerCopy")}
              </p>
              <p className="ke-footer-legal-note mt-2 max-w-prose" data-ke="data-sources">
                <span className="font-medium text-fg">{t("dataSourcesTitle")}. </span>
                {t("dataSourcesBody")}
              </p>
              <p className="ke-footer-legal-note">{t("neverSell")}</p>
              <p className="ke-footer-legal-note" data-ke="company-operator">
                {companyOperatorLine(fr ? "fr" : "en")}
              </p>
            </div>
            <div className="ke-footer-legal-meta flex flex-row flex-wrap items-center justify-end gap-1">
              <ShareKidEaseButton appearance="labeled" className="rounded-full border border-border px-3" />
              <HeaderSocial always />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
