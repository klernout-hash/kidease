import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

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

export function SiteFooter() {
  const { t, locale } = useCopy();
  const fr = locale === "fr";

  return (
    <footer className="ke-site-footer [[data-channel=app]_&]:hidden">
      <div className="ke-gutter mx-auto max-w-6xl py-12 md:py-16">
        <nav className="ke-footer-cols" aria-label="KidEase">
          <section>
            <p className="ke-footer-title">{fr ? "Soutien" : "Support"}</p>
            <ul className="ke-footer-list">
              <Item to="/support">{fr ? "Centre d’aide" : "Help Centre"}</Item>
              <Item to="/contact">{t("contact")}</Item>
              <Item to="/faq">FAQ</Item>
              <Item to="/how-it-works">{t("howItWorksCta")}</Item>
              <Item to="/privacy">{t("privacy")}</Item>
              <Item to="/terms">{t("terms")}</Item>
              <li>
                <a href="mailto:kyle@kidease.ca" className="ke-footer-link">
                  kyle@kidease.ca
                </a>
              </li>
            </ul>
          </section>

          <section>
            <p className="ke-footer-title">Parents</p>
            <ul className="ke-footer-list">
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
            </ul>
          </section>

          <section>
            <p className="ke-footer-title">{fr ? "Garderies" : "Daycares"}</p>
            <ul className="ke-footer-list">
              <Item to="/claim">{t("claimCta")}</Item>
              <Item to="/login" search={{ role: "provider", intent: "in", next: "/provider" }}>
                {t("providerLogin")}
              </Item>
              <Item to="/provider">{fr ? "Espace garderie" : "Daycare desk"}</Item>
              <Item to="/about">{t("about")}</Item>
              <Item to="/team">{t("team")}</Item>
              <Item to="/privacy">{t("verifyListings")}</Item>
              <li>
                <a href="https://childcaresearch.gov.mb.ca/en" target="_blank" rel="noreferrer" className="ke-footer-link">
                  {t("mbChildcare")}
                </a>
              </li>
            </ul>
          </section>
        </nav>

        <div className="ke-footer-legal">
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
