import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { NEW_AUTOMATION_FLAGS, TURN_ON_FLAGS } from "@/lib/automations";
import { TwoFactorGate } from "@/lib/auth/gates";
import { useCopy } from "@/lib/use-copy";

/**
 * Web-only desk. Native shells are sent away by the admin path rule.
 * Subscriptions and in-app purchases stay off. This page does not turn flags on.
 */
export function AdminAutomationsPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <TwoFactorGate next="/admin-automations">
      <Shell>
        <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-col px-4 py-8">
          <p className="text-sm font-semibold text-primary">KidEase</p>
          <h1 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">
            {fr ? "Courriels automatiques" : "Automatic emails"}
          </h1>
          <p className="mt-3 max-w-prose text-base">
            {fr
              ? "KidEase peut envoyer des rappels aux parents et aux garderies. Rien ne part tant que le drapeau est éteint."
              : "KidEase can email parents and daycares about bills, listings, tours, and open spots. Nothing sends while a flag is off."}
          </p>
          <p className="mt-3 max-w-prose text-base text-muted">
            {fr
              ? "Allumer un drapeau ne fait qu’écrire dans le journal. Un second interrupteur _LIVE envoie vraiment. Les abonnements dans l’app restent éteints."
              : "Turning a flag on only writes a log. A second _LIVE switch sends for real. In-app subscriptions stay off."}
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/help">{fr ? "Aide" : "Help"}</Link>
            </Button>
          </div>
          <h2 className="mt-10 text-lg font-semibold">{fr ? "Nouveaux drapeaux (éteints)" : "New flags (off)"}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {NEW_AUTOMATION_FLAGS.map((key) => (
              <li key={key} className="rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
                <code>{key}</code>
                <span className="mt-1 block text-muted">
                  {fr
                    ? `Éteint par défaut. Envoi réel seulement avec ${key}_LIVE=1.`
                    : `Default off. Live only with ${key}_LIVE=1.`}
                </span>
              </li>
            ))}
          </ul>
          <h2 className="mt-8 text-lg font-semibold">{fr ? "Déjà dans l’app" : "Already in the app"}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {TURN_ON_FLAGS.map((row) => (
              <li key={row.key} className="rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
                <code>{row.key}</code>
                <span className="mt-1 block text-muted">{row.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8">
            <Link to="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
              {fr ? "Retour à l’admin" : "Back to admin"}
            </Link>
          </p>
        </main>
      </Shell>
    </TwoFactorGate>
  );
}
