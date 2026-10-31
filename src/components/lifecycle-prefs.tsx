import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NOTICE_CATEGORIES, type NoticePrefs } from "@/lib/lifecycle";
import { loadLifecyclePrefs, saveLifecyclePrefs } from "@/lib/server/lifecycle";
import { useCopy } from "@/lib/use-copy";

const LABELS: Record<(typeof NOTICE_CATEGORIES)[number], { en: string; fr: string }> = {
  tours: { en: "Tours", fr: "Visites" },
  messages: { en: "Messages", fr: "Messages" },
  spots: { en: "Spots", fr: "Places" },
  account: { en: "Account", fr: "Compte" },
  tips: { en: "Tips", fr: "Conseils" },
};

export function LifecyclePrefs() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [prefs, setPrefs] = useState<NoticePrefs | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadLifecyclePrefs()
      .then((row) => {
        setEnabled(row.enabled);
        setPrefs(row.prefs);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled || !prefs) return null;

  function setChoice(category: (typeof NOTICE_CATEGORIES)[number], channel: "email" | "sms", value: boolean) {
    setPrefs((current) => {
      if (!current) return current;
      if (category === "tips" && channel === "sms") return current;
      return { ...current, [category]: { ...current[category], [channel]: value } };
    });
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="lifecycle-prefs">
      <h2 className="font-display text-xl">{fr ? "Préférences d’avis" : "Notice preferences"}</h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Les textos partent seulement avec un consentement CASL. Les conseils sont éteints tant que vous ne les ouvrez pas. Se désabonner coupe tout."
          : "Texts go out only with CASL consent. Tips stay off until you turn them on. Unsubscribe stops everything."}
      </p>
      <ul className="mt-4 space-y-3">
        {NOTICE_CATEGORIES.map((category) => (
          <li key={category} className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{LABELS[category][fr ? "fr" : "en"]}</span>
            <span className="flex gap-4">
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs[category].email}
                  onChange={(event) => setChoice(category, "email", event.target.checked)}
                />
                {fr ? "Courriel" : "Email"}
              </label>
              {category === "tips" ? null : (
                <label className="inline-flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefs[category].sms}
                    onChange={(event) => setChoice(category, "sms", event.target.checked)}
                  />
                  SMS
                </label>
              )}
            </span>
          </li>
        ))}
      </ul>
      <label className="mt-4 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.unsubscribedAll}
          onChange={(event) => setPrefs({ ...prefs, unsubscribedAll: event.target.checked })}
        />
        {fr ? "Se désabonner de tout" : "Unsubscribe from all"}
      </label>
      <Button
        type="button"
        className="mt-4"
        onClick={() => {
          void saveLifecyclePrefs({ data: prefs })
            .then((result) => setNote(result.ok ? (fr ? "Enregistré." : "Saved.") : fr ? "Éteint." : "Off."))
            .catch(() => setNote(fr ? "Pas enregistré." : "Not saved."));
        }}
      >
        {fr ? "Enregistrer" : "Save"}
      </Button>
      {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
    </section>
  );
}
