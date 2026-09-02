import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

export function SiteFooter() {
  const { t } = useCopy();
  return (
    <footer className="border-t border-border bg-bg">
      <div className="ke-gutter mx-auto max-w-6xl py-10">
        <p className="text-sm font-medium">{t("footerCopy")}</p>
        <nav className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted sm:flex sm:flex-wrap sm:gap-x-5">
          <Link to="/about" className="hover:text-fg">
            {t("about")}
          </Link>
          <Link to="/how-it-works" className="hover:text-fg">
            {t("howItWorksCta")}
          </Link>
          <Link to="/get-app" className="hover:text-fg">
            {t("getApp")}
          </Link>
          <Link to="/team" className="hover:text-fg">
            {t("team")}
          </Link>
          <Link to="/contact" className="hover:text-fg">
            {t("contact")}
          </Link>
          <Link to="/benefits" className="hover:text-fg">
            {t("benefitsTab")}
          </Link>
          <Link to="/tour-checklist" className="hover:text-fg">
            {t("tourChecklist")}
          </Link>
          <Link to="/compare" className="hover:text-fg">
            {t("compare")}
          </Link>
          <Link to="/account" className="hover:text-fg">
            {t("saved")}
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            {t("privacy")}
          </Link>
          <Link to="/terms" className="hover:text-fg">
            {t("terms")}
          </Link>
          <Link to="/support" className="hover:text-fg">
            {t("support")}
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            {t("verifyListings")}
          </Link>
          <a href="https://childcaresearch.gov.mb.ca/en" target="_blank" rel="noreferrer" className="hover:text-fg">
            {t("mbChildcare")}
          </a>
        </nav>
        <p className="mt-5 text-sm text-muted">
          App Store · Coming soon
          <span className="mx-2 text-subtle">·</span>
          Google Play · Coming soon
        </p>
        <p className="mt-4 text-xs text-subtle">{t("neverSell")}</p>
        <a href="mailto:kyle@kidease.ca" className="mt-3 inline-block text-xs text-muted hover:text-fg">
          kyle@kidease.ca
        </a>
        <div className="mt-8 border-t border-border/70 pt-4">
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
