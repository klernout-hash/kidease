import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { homeFeedEnabled } from "@/lib/home-feed";
import { localePath } from "@/lib/locale-path";
import { loadMyFeedPrefs, saveMyFeedPrefs } from "@/lib/server/home-feed";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/for-you")({
  loader: () => loadMyFeedPrefs().catch(() => ({ enabled: homeFeedEnabled(), prefs: null })),
  head: () => ({
    meta: [
      { title: "For you · KidEase" },
      { name: "description", content: "A home feed for your city and your child's age. KidEase does not invent open spots." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EnglishForYou,
});

function EnglishForYou() {
  return <ForYouPage initial={Route.useLoaderData()} />;
}

export function ForYouPage({
  initial,
}: {
  initial: { enabled: boolean; prefs: { city: string; province: string; childAgeMonths: number | null; startDate: string | null } | null };
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [city, setCity] = useState(initial.prefs?.city ?? "");
  const [province, setProvince] = useState(initial.prefs?.province ?? "");
  const [age, setAge] = useState(initial.prefs?.childAgeMonths != null ? String(initial.prefs.childAgeMonths) : "");
  const [start, setStart] = useState(initial.prefs?.startDate ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const enabled = initial.enabled;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await saveMyFeedPrefs({
      data: {
        city,
        province,
        childAgeMonths: age.trim() ? Number(age) : null,
        startDate: start || null,
      },
    });
    setMessage(result.ok ? (fr ? "Préférences enregistrées." : "Preferences saved.") : fr ? "Pas enregistré." : "Not saved.");
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl md:text-4xl">{fr ? "Pour vous" : "For you"}</h1>
        <p className="mt-4 text-muted">
          {fr
            ? "Un fil selon votre ville, l’âge de l’enfant et la date de début. Une date ne crée pas de place libre."
            : "A feed for your city, your child's age, and a start date. A date does not create an open spot."}
        </p>
        {!enabled ? (
          <p className="mt-4 text-sm" role="status">
            {fr ? "Ce fil est éteint pour le moment." : "This feed is off for now."}
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(event) => void save(event)}>
            <label className="block text-sm font-medium">
              {fr ? "Ville" : "City"}
              <input className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" value={city} onChange={(event) => setCity(event.target.value)} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })} required />
            </label>
            <label className="block text-sm font-medium">
              {fr ? "Province" : "Province"}
              <input className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" value={province} onChange={(event) => setProvince(event.target.value)} maxLength={2} required />
            </label>
            <label className="block text-sm font-medium">
              {fr ? "Âge en mois" : "Age in months"}
              <input className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              {fr ? "Date de début" : "Start date"}
              <input className="mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3" type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <Button type="submit">{fr ? "Enregistrer" : "Save"}</Button>
            {message ? <p role="status">{message}</p> : null}
          </form>
        )}
        <p className="mt-8">
          <Link to={localePath("/search", locale)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Chercher une garderie" : "Search daycare"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
