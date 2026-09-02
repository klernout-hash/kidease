import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

export function SiteFooter() {
  const { t } = useCopy();
  return (
    <footer className="border-t border-border bg-bg">
      <div className="ke-gutter mx-auto max-w-6xl py-10">
        <p className="text-sm font-medium">{t("footerCopy")}</p>
        <nav className="mt-4 grid grid-cols-2 gap-x-4 gap-y-0 text-sm text-muted sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
          <Link to="/about" className="hover:text-fg">
            {t("about")}
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
          <a
            href="https://childcaresearch.gov.mb.ca/en"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg"
          >
            {t("mbChildcare")}
          </a>
          <Link to="/claim" className="hover:text-fg">
            {t("providerLogin")}
          </Link>
        </nav>
        <p className="mt-4 text-xs text-subtle">{t("neverSell")}</p>
        <a href="mailto:kyle@kidease.ca" className="mt-3 inline-block text-xs text-muted hover:text-fg">
          kyle@kidease.ca
        </a>
      </div>
    </footer>
  );
}
