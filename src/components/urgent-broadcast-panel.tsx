import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { planUrgentBroadcast, type BroadcastCentre } from "@/lib/urgent-broadcast";
import { localePath } from "@/lib/locale-path";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Button } from "@/components/ui/button";

const STORAGE = "kidease-urgent-broadcast-at";

function readLast(userId: string): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; at?: string };
    if (parsed.userId !== userId) return null;
    return parsed.at || null;
  } catch {
    return null;
  }
}

export function UrgentBroadcastPanel({ centres }: { centres: Array<BroadcastCentre & { name: string; slug: string }> }) {
  const { locale } = useCopy();
  const { celebrate } = useSuccessConfirm();
  const fr = locale === "fr";
  const { user } = useCurrentUserState();
  const [days, setDays] = useState("7");
  const [age, setAge] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const needed = Number(days);
  const last = user ? readLast(user.id) : null;

  const plan = useMemo(
    () =>
      planUrgentBroadcast(centres, {
        neededWithinDays: needed,
        signedIn: Boolean(user),
        lastBroadcastAt: last,
        ageBand: age || null,
      }),
    [age, centres, last, needed, user],
  );

  function send() {
    if (!user || !plan.allowed) return;
    const at = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE, JSON.stringify({ userId: user.id, at }));
    } catch {
      /* ignore */
    }
    setSent(at);
    celebrate();
  }

  const reason =
    plan.reason === "sign-in"
      ? fr
        ? "Connectez-vous pour marquer cette recherche comme vérifiée."
        : "Sign in to mark this search reviewed."
      : plan.reason === "window"
        ? fr
          ? "Ces résultats sont pour un besoin de garde dans les 14 prochains jours."
          : "These matches are for care needed within the next 14 days."
        : plan.reason === "cooldown"
          ? fr
            ? "Vous avez vérifié ces résultats dans les 7 derniers jours. Ouvrez une fiche pour contacter un centre."
            : "You reviewed these matches in the last 7 days. Open a listing to contact a centre."
          : plan.reason === "none"
            ? fr
              ? "Aucun centre de cette liste ne correspond."
              : "No centre in this list matches."
            : fr
              ? `${plan.centres.length} centres correspondent.`
              : `${plan.centres.length} centres match.`;

  return (
    <section className="mt-8 rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="urgent-broadcast">
      <h2 className="font-display text-2xl">{fr ? "Besoin de garde vite" : "Need care fast"}</h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Trouvez jusqu’à 10 centres qui correspondent à vos besoins. Ouvrez leur fiche pour les contacter."
          : "Find up to 10 centres that match your needs. Open a listing to contact them."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Jours avant le début" : "Days until you need care"}</span>
          <input
            inputMode="numeric"
            className="ke-input mt-1 w-full"
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/[^\d]/g, "").slice(0, 2))}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Groupe d'âge" : "Age band"}</span>
          <select className="ke-input mt-1 w-full" value={age} onChange={(event) => setAge(event.target.value)}>
            <option value="">{fr ? "Tous" : "Any"}</option>
            <option value="infant">{fr ? "Poupon" : "Infant"}</option>
            <option value="toddler">{fr ? "Tout-petit" : "Toddler"}</option>
            <option value="preschool">{fr ? "Préscolaire" : "Preschool"}</option>
            <option value="school-age">{fr ? "Âge scolaire" : "School-age"}</option>
          </select>
        </label>
      </div>
      <p className="mt-3 text-sm" data-ke="urgent-broadcast-reason">{reason}</p>
      {plan.centres.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {plan.centres.map((centre) => (
            <li key={centre.id}>
              <Link to="/daycare/$slug" params={{ slug: centre.slug }} className="font-medium text-primary underline-offset-4 hover:underline">
                {centre.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {user ? (
        <Button type="button" className="mt-4" disabled={!plan.allowed || Boolean(sent)} onClick={send}>
          {sent ? (fr ? "Recherche vérifiée" : "Search reviewed") : fr ? "Marquer la recherche comme vérifiée" : "Mark search reviewed"}
        </Button>
      ) : (
        <Button type="button" className="mt-4" asChild>
          <Link to={localePath("/login", locale)} search={{ next: localePath("/need-care-fast", locale), role: "parent", desk: "parent", intent: "in" }}>
            {fr ? "Se connecter" : "Sign in"}
          </Link>
        </Button>
      )}
    </section>
  );
}
