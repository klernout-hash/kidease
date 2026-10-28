import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useRoleChrome } from "@/components/role-chrome";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead, withNoindex } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export function waitlistHead(locale: "en" | "fr") {
  return withNoindex(
    pageSeoHead({
      title: locale === "fr" ? "Liste d'attente · KidEase" : "Waitlist · KidEase",
      description:
        locale === "fr"
          ? "Voyez votre place sur la liste et les offres de 48 heures."
          : "See your waitlist place and 48-hour spot offers.",
      path: locale === "fr" ? "/fr/waitlist" : "/waitlist",
      locale,
    }),
  );
}

export function WaitlistPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const chrome = useRoleChrome();
  if (chrome.signedIn && chrome.role === "parent" && !chrome.guestView) {
    return <Navigate to={localePath("/parent", locale)} search={{ tab: "waitlists" }} />;
  }
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <h1 className="font-display text-3xl">{fr ? "Votre liste d'attente" : "Your waitlist"}</h1>
        <p className="mt-3 text-muted">
          {fr
            ? "Connectez-vous pour voir votre position et les offres de place."
            : "Sign in to see your position and spot offers."}
        </p>
        <Link
          to={localePath("/login", locale)}
          search={{ next: localePath("/waitlist", locale), role: "parent", desk: "parent", intent: "in" }}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
        >
          {fr ? "Se connecter" : "Sign in"}
        </Link>
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/waitlist")({
  head: () => waitlistHead("en"),
  component: WaitlistPage,
});
