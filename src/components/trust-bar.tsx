import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/** One quiet line above featured listings. Server-rendered. No police-check claim. */
export function TrustBar() {
  const { t, locale } = useCopy();
  return (
    <p data-ke="home-trust-line" className="mx-auto max-w-3xl text-balance text-center text-sm leading-6 text-muted">
      {t("trustBarLead")}{" "}
      <Link
        to={localePath("/verify", locale)}
        className="relative font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation after:absolute after:-inset-x-2 after:-inset-y-3"
      >
        {t("homeTrustVerify")}
      </Link>
    </p>
  );
}
