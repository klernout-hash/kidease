import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useCopy } from "@/lib/use-copy";

function Col({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <ul className="mt-4 space-y-3 text-sm text-muted">{children}</ul>
    </div>
  );
}

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
      <Link to={to} search={search} className="hover:text-fg hover:underline hover:underline-offset-4">
        {children}
      </Link>
    </li>
  );
}

export function SiteFooter() {
  const { t, locale } = useCopy();
  const fr = locale === "fr";
  const support = fr ? "Soutien" : "Support";
  const parents = "Parents";
  const daycares = fr ? "Garderies" : "Daycares";
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const list = document.querySelectorAll("footer.ke-site-footer");
    list.forEach((el, i) => {
      (el as HTMLElement).hidden = i !== list.length - 1;
    });
  }, []);

  return (
    <footer ref={root} className="ke-site-footer border-t border-border bg-surface [[data-channel=app]_&]:hidden">
      <div className="ke-gutter mx-auto max-w-6xl py-12 md:py-16">
        <nav className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3" aria-label="KidEase">
          <Col title={support}>
            <Item to="/support">{fr ? "Centre d’aide" : "Help Centre"}</Item>
            <Item to="/contact">{t("contact")}</Item>
            <Item to="/faq">FAQ</Item>
            <Item to="/how-it-works">{t("howItWorksCta")}</Item>
            <Item to="/privacy">{t("privacy")}</Item>
            <Item to="/terms">{t("terms")}</Item>
            <li>
              <a href="mailto:kyle@kidease.ca" className="hover:text-fg hover:underline hover:underline-offset-4">
                kyle@kidease.ca
              </a>
            </li>
          </Col>

          <Col title={parents}>
            <Item to="/search">{t("search")}</Item>
            <Item to="/login" search={{ role: "parent", intent: "in", next: "/parent" }}>
              {t("parentSignIn")}
            </Item>
            <Item to="/parent">{fr ? "Espace parent" : "Parent desk"}</Item>
            <Item to="/benefits">{t("benefitsTab")}</Item>
            <Item to="/tour-checklist">{t("tourChecklist")}</Item>
            <Item to="/compare">{t("compare")}</Item>
            <Item to="/account" search={{ tab: "saved" }}>
              {t("saved")}
            </Item>
            <Item to="/get-app">{t("getApp")}</Item>
          </Col>

          <Col title={daycares}>
            <Item to="/claim">{t("claimCta")}</Item>
            <Item to="/login" search={{ role: "provider", intent: "in", next: "/provider" }}>
              {t("providerLogin")}
            </Item>
            <Item to="/provider">{fr ? "Espace garderie" : "Daycare desk"}</Item>
            <Item to="/about">{t("about")}</Item>
            <Item to="/team">{t("team")}</Item>
            <Item to="/privacy">{t("verifyListings")}</Item>
            <li>
              <a
                href="https://childcaresearch.gov.mb.ca/en"
                target="_blank"
                rel="noreferrer"
                className="hover:text-fg hover:underline hover:underline-offset-4"
              >
                {t("mbChildcare")}
              </a>
            </li>
          </Col>
        </nav>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} KidEase
            <span className="mx-2 text-subtle">·</span>
            {t("footerCopy")}
          </p>
          <p className="text-xs text-subtle">
            App Store · Coming soon
            <span className="mx-2">·</span>
            Google Play · Coming soon
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">{t("neverSell")}</p>
          <Link
            to="/login"
            search={{ role: "admin", intent: "in", next: "/admin" }}
            className="text-[11px] tracking-wide text-subtle hover:text-muted"
          >
            Operator sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}
