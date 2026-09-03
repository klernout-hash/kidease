import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

export function SiteFooter() {
  const { t } = useCopy();

  return (
    <footer className="ke-site-footer [[data-channel=app]_&]:hidden">
      <div className="ke-gutter mx-auto max-w-6xl py-8">
        <div className="ke-footer-legal">
          <p>
            © {new Date().getFullYear()} KidEase
            <span className="mx-2 text-subtle">·</span>
            {t("footerCopy")}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
            <Link to="/privacy" className="hover:text-muted">
              {t("privacy")}
            </Link>
            <Link to="/terms" className="hover:text-muted">
              {t("terms")}
            </Link>
            <a href="mailto:kyle@kidease.ca" className="hover:text-muted">
              kyle@kidease.ca
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
