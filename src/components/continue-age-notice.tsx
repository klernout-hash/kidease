import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

/**
 * Shown under social buttons and on email sign-up.
 * Continuing records 18+ and terms acceptance on the profile.
 */
export function ContinueAgeNotice() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const linkClass =
    "rounded-sm font-medium text-fg underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  return (
    <p className="text-sm leading-snug text-muted" data-ke="age-terms">
      {fr
        ? "En continuant, vous confirmez avoir 18 ans ou plus et vous acceptez les "
        : "By continuing, you confirm you're 18 or older and agree to the "}
      <Link to={localePath("/terms", locale)} className={linkClass}>
        {fr ? "Conditions" : "Terms"}
      </Link>
      {fr ? " et la " : " and "}
      <Link to={localePath("/privacy", locale)} className={linkClass}>
        {fr ? "Politique de confidentialité" : "Privacy Policy"}
      </Link>
      .
    </p>
  );
}
