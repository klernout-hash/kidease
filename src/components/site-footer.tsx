import { useLayoutEffect } from "react";
import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  FOOTER_COLUMNS,
  footerLinkLabel,
  sortFooterLinks,
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
  const labeled = links.map((link) => ({
    ...link,
    href: link.localePaired ? localePath(link.to, locale) : link.to,
    label: footerLinkLabel(link, t, locale),
  }));
  const sorted = sortFooterLinks(labeled, locale);

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
  const fr = locale === "fr";
  // King-admin privacy: guests and non-kyle sessions never see operator login.
  // Wait out isPending so the link never flashes for the public.
  const showOperatorSignIn = !isPending && isKidEaseOperatorEmail(user?.primaryEmail);

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
            <Column id="parents" title="Parents" links={FOOTER_COLUMNS.parents} locale={locale} t={t} />
            <Column
              id="daycares"
              title={fr ? "Garderies" : "Daycares"}
              links={FOOTER_COLUMNS.daycares}
              locale={locale}
              t={t}
            />
            <Column id="kidease" title={t("app")} links={FOOTER_COLUMNS.kidease} locale={locale} t={t} />
            <Column id="support" title={t("support")} links={FOOTER_COLUMNS.support} locale={locale} t={t} />
          </nav>

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
              <p>
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
              {showOperatorSignIn ? (
                <Link
                  to="/login"
                  search={{ role: "admin", desk: "admin", intent: "admin", next: "/admin" }}
                  className="ke-footer-operator"
                >
                  {t("operatorSignIn")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
