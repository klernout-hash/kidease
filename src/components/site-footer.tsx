import { useLayoutEffect } from "react";
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

  useLayoutEffect(() => {
    const all = document.querySelectorAll("footer.ke-site-footer");
    if (all.length < 2) return;
    all.forEach((node, index) => {
      if (index === all.length - 1) node.removeAttribute("hidden");
      else node.setAttribute("hidden", "");
    });
  }, []);

  return (
    <footer className="ke-site-footer [[data-channel=app]_&]:hidden">
      <div className="ke-gutter">
        <div className="ke-footer-inner">
          <nav className="ke-footer-cols" aria-label="KidEase">
            <section>
              <p className="ke-footer-title">{t("support")}</p>
              <ul className="ke-footer-list">
                <Item to="/help">{t("helpTitle")}</Item>
                <Item to="/contact">{t("contact")}</Item>
                <Item to="/faq">FAQ</Item>
                <Item to="/how-it-works">{t("howItWorksCta")}</Item>
                <Item to="/privacy">{t("privacy")}</Item>
                <Item to="/terms">{t("terms")}</Item>
                <Item to="/cookies">{t("cookies")}</Item>
              </ul>
            </section>

            <section>
              <p className="ke-footer-title">Parents</p>
              <ul className="ke-footer-list">
                <Item to="/search">{t("search")}</Item>
                <Item to="/login" search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}>
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
                <Item to="/login" search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}>
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
                    className="ke-footer-link"
                  >
                    {t("mbChildcare")}
                  </a>
                </li>
              </ul>
            </section>
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
              <Link
                to="/login"
                search={{ role: "admin", desk: "admin", intent: "in", next: "/admin" }}
                className="ke-footer-operator"
              >
                {t("operatorSignIn")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
