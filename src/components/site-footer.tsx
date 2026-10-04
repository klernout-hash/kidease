import { useLayoutEffect } from "react";
import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HeaderSocial } from "@/components/header-social";
import { useRoleChrome } from "@/components/role-chrome";
import type { ChromeRole } from "@/lib/role-access";
import { LanguageSelect } from "@/components/language-select";
import { ShareKidEaseButton } from "@/components/share-button";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL,
  footerLinkLabel,
  type FooterColumnId,
  type FooterLinkDef,
} from "@/lib/site-footer-nav";

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
        {id === "kidease" ? (
          <li>
            <ShareKidEaseButton appearance="row" />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export function SiteFooter() {
  const { t, locale } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const chrome = useRoleChrome();
  const fr = locale === "fr";
  // Operator sign-in is not linked from the public footer. Kyle uses /login.
  void isPending;
  void isKidEaseOperatorEmail(user?.primaryEmail);

  useLayoutEffect(() => {
    const all = document.querySelectorAll("footer.ke-site-footer");
    if (all.length < 2) return;
    all.forEach((node, index) => {
      if (index === all.length - 1) node.removeAttribute("hidden");
      else node.setAttribute("hidden", "");
    });
  }, []);

  return (
    <footer className="ke-site-footer ke-web-only [[data-channel=app]_&]:hidden">
      <div className="ke-gutter">
        <div className="ke-footer-inner">
          <nav className="ke-footer-cols" aria-label="KidEase">
            <Column
              id="parents"
              title="Parents"
              links={linksForRole(FOOTER_COLUMNS.parents, chrome.role, "parents", chrome.pending || chrome.role !== "guest")}
              locale={locale}
              t={t}
            />
            <Column
              id="daycares"
              title={fr ? "Garderies" : "Daycares"}
              links={linksForRole(FOOTER_COLUMNS.daycares, chrome.role, "daycares", chrome.pending || chrome.role !== "guest")}
              locale={locale}
              t={t}
            />
            <Column id="support" title={t("support")} links={linksForRole(FOOTER_COLUMNS.support, chrome.role, "support", chrome.pending || chrome.role !== "guest")} locale={locale} t={t} />
            <Column id="kidease" title={t("app")} links={linksForRole(FOOTER_COLUMNS.kidease, chrome.role, "kidease", chrome.pending || chrome.role !== "guest")} locale={locale} t={t} />
          </nav>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {FOOTER_LEGAL.map((link) => (
              <Link
                key={link.to}
                to={localePath(link.to, locale)}
                className="ke-footer-link inline-flex min-h-11 items-center"
              >
                {footerLinkLabel(link, t, locale)}
              </Link>
            ))}
            <LanguageSelect />
          </div>

          <div className="ke-footer-legal">
            <div className="ke-footer-legal-copy">
              <p>
                © {new Date().getFullYear()} KidEase
                <span className="mx-1.5 text-subtle" aria-hidden>
                  ·
                </span>
                {t("footerCopy")}
              </p>
              <p className="ke-footer-legal-note">{t("neverSell")}</p>
            </div>
            <div className="ke-footer-legal-meta">
              <HeaderSocial />
              <p data-ke="store-coming-soon">
                {t("appStore")}
                <span className="mx-1.5" aria-hidden>
                  ·
                </span>
                {t("comingSoon")}
                <span className="mx-1.5" aria-hidden>
                  ·
                </span>
                {t("googlePlay")}
                <span className="mx-1.5" aria-hidden>
                  ·
                </span>
                {t("comingSoon")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
