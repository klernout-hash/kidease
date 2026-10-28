import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { planUrgentBroadcast, type BroadcastCentre } from "@/lib/urgent-broadcast";
import { localePath } from "@/lib/locale-path";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
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
  }

  const reason =
    plan.reason === "sign-in"
      ? fr
        ? "Connectez-vous pour envoyer une demande urgente."
        : "Sign in to send an urgent request."
      : plan.reason === "window"
        ? fr
          ? "La demande urgente est pour les 14 prochains jours."
          : "Urgent requests are for the next 14 days."
        : plan.reason === "cooldown"
          ? fr
            ? "Vous pouvez envoyer une demande tous les 7 jours."
            : "You can send one request every 7 days."
          : plan.reason === "none"
            ? fr
              ? "Aucun centre revendiqué dans cette liste ne correspond."
              : "No claimed centre in this list matches."
            : fr
              ? `${plan.centres.length} centres au maximum (plafond de ${plan.cap}).`
              : `${plan.centres.length} centres at most (cap of ${plan.cap}).`;

  return (
    <section className="mt-8 rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="urgent-broadcast">
      <h2 className="font-display text-2xl">{fr ? "Besoin de garde vite" : "Need care fast"}</h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Une demande aux centres revendiqués, au plus 10, une fois par 7 jours. Les textos arrivent plus tard."
          : "One note to claimed centres, at most 10, once every 7 days. Texts are coming soon."}
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
          {sent ? (fr ? "Demande notée" : "Request saved") : fr ? "Envoyer la demande" : "Send the request"}
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
