import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { AreaWaitlistForm } from "@/components/area-waitlist-form";
import { Shell } from "@/components/shell";
import { useRoleChrome } from "@/components/role-chrome";
import { areaWaitlistCopy } from "@/lib/area-waitlist-copy";
import { parentLoginSearch, parentSignupSearch } from "@/lib/auth/parent-login";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead, withNoindex } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export function waitlistHead(locale: "en" | "fr") {
  return withNoindex(
    pageSeoHead({
      title: locale === "fr" ? "Liste d'attente · KidEase" : "Waitlist · KidEase",
      description:
        locale === "fr"
          ? "Ouvrez une garderie et touchez Joindre la liste d'attente, ou joignez une liste de secteur."
          : "Open any daycare and tap Join the waitlist, or join an area waitlist.",
      path: locale === "fr" ? "/fr/waitlist" : "/waitlist",
      locale,
    }),
  );
}

export function WaitlistPage() {
  const { locale } = useCopy();
  const copy = areaWaitlistCopy(locale);
  const chrome = useRoleChrome();
  const next = localePath("/parent", locale) + "?tab=waitlists";
  if (chrome.signedIn && chrome.role === "parent" && !chrome.guestView) {
    return <Navigate to={localePath("/parent", locale)} search={{ tab: "waitlists" }} />;
  }
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8" data-ke="waitlist-guest">
        <h1 className="font-display text-3xl">{copy.guestTitle}</h1>
        <p className="mt-3 text-muted">{copy.guestWhat}</p>
        <p className="mt-2 text-muted">{copy.guestWhy}</p>
        <p className="mt-2 text-muted">{copy.guestHow}</p>
        <AreaWaitlistForm returnTo={next} primary />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            to={localePath("/login", locale)}
            search={parentLoginSearch(next)}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-border"
          >
            {copy.signIn}
          </Link>
          <Link
            to={localePath("/login", locale)}
            search={parentSignupSearch(next, "waitlist")}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-primary"
          >
            {copy.createAccount}
          </Link>
        </div>
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/waitlist")({
  head: () => waitlistHead("en"),
  component: WaitlistPage,
});
