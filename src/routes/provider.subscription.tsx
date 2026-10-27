import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { ProviderSubscriptionPanel } from "@/components/provider-subscription";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState, useLocallySignedOut } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canBuyDaycareUpgrade } from "@/lib/upgrade-role";
import { useRoleChrome } from "@/components/role-chrome";
import { useCopy } from "@/lib/use-copy";
import { parseAppRole } from "@/lib/desks";
import { providerNavSearch } from "@/lib/desk-nav";
import { FOUNDING_FREE_FEATURES, FOUNDING_PAGE, foundingLocale } from "@/lib/founding-period";

export const Route = createFileRoute("/provider/subscription")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: {
      checkout?: "success" | "cancel";
      addon?: "success" | "cancel";
      plan?: string;
      item?: string;
      session?: string;
      interval?: "month" | "year";
      billing?: "return";
    } = {};
    if (s.checkout === "success" || s.checkout === "cancel") out.checkout = s.checkout;
    if (s.addon === "success" || s.addon === "cancel") out.addon = s.addon;
    if (s.plan === "pro" || s.plan === "network") out.plan = s.plan;
    if (s.item === "featured_city" || s.item === "claim_boost" || s.item === "job_post") out.item = s.item;
    if (typeof s.session === "string" && /^cs_[A-Za-z0-9_]+$/.test(s.session)) out.session = s.session;
    if (s.interval === "month" || s.interval === "year") out.interval = s.interval;
    if (s.billing === "return") out.billing = "return";
    return out;
  },
  head: () => ({
    meta: [
      { title: "Subscription · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProviderSubscriptionPage,
});

function ProviderSubscriptionPage() {
  const { t, locale } = useCopy();
  const navigate = useNavigate();
  const upgradeSearch = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const locallyOut = useLocallySignedOut();
  const chrome = useRoleChrome();
  const { session, ready } = useSessionDesks();
  const daycareBuyer = Boolean(
    session &&
      canBuyDaycareUpgrade({
        role: session.role,
        ownsCentre: session.ownsCentre,
        linkedToCentre: session.centreLinked,
      }),
  );
  const allowed = Boolean(daycareBuyer && session?.providerSubscriptions && session.subscriptionsEnabled);

  if (locallyOut) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (isPending || chrome.pending || (user && !ready)) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user && (chrome.pending || chrome.signedIn)) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!session) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">{t("accountUnconfirmedTitle")}</h1>
          <p className="mt-3 text-muted">{t("accountUnconfirmedBody")}</p>
        </main>
      </Shell>
    );
  }
  if (session.subscriptionsEnabled !== true) {
    if (daycareBuyer || parseAppRole(session.role) === "provider") {
      return <Navigate to="/provider" search={{ desk: "today" }} />;
    }
    if (session.home === "/admin") return <Navigate to="/admin" />;
    if (session.home === "/support") return <Navigate to="/support" />;
    return <Navigate to="/parent" />;
  }
  if (!daycareBuyer) {
    if (parseAppRole(session.role) === "provider") {
      return (
        <Shell>
          <main className="mx-auto max-w-lg px-4 py-16 text-center">
            <h1 className="font-display text-3xl">{t("claimCta")}</h1>
            <p className="mt-3 text-muted">
              {t("plansAfterClaim")}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/claim">{t("claimCta")}</Link>
              </Button>
              <Button asChild variant="secondary" className="ke-digital-plan" data-ke="digital-plan">
                <Link to="/plans">{t("navPlans")}</Link>
              </Button>
            </div>
          </main>
        </Shell>
      );
    }
    return <Navigate to="/parent" />;
  }
  if (!allowed) {
    const lang = foundingLocale(locale);
    const copy = FOUNDING_PAGE[lang];
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-10">
          <p className="text-sm font-semibold text-primary">{copy.daycarePill}</p>
          <h1 className="mt-2 font-display text-3xl">{copy.daycareName}</h1>
          <p className="mt-2 text-sm font-medium">{lang === "fr" ? "Sans frais" : "No charge"}</p>
          <p className="mt-3 text-sm text-muted">{copy.daycareBody}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
            {FOUNDING_FREE_FEATURES.map((row) => (
              <li key={row.en}>{row[lang]}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            {t("plansForDirectors")}
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/provider" search={{ desk: "today" }}>
                {t("todayHome")}
              </Link>
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next="/provider/subscription">
      <DeskShell
        desk="daycare"
        active="subscription"
        onSelect={(id) => {
          if (id === "subscription") return;
          void navigate({ to: "/provider", search: providerNavSearch(id) });
        }}
      >
        <p className="ke-native-plan-note mb-4 text-sm text-muted" data-ke="native-plan-note">
          {t("nativePlansHidden")}
        </p>
        <ProviderSubscriptionPanel upgradeSearch={upgradeSearch} billingReturn={upgradeSearch.billing === "return"} />
      </DeskShell>
    </TwoFactorGate>
  );
}
