import { useEffect, useState } from "react";
import { useSuccessConfirm } from "@/components/use-success-confirm";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/switch-row";
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
  const { celebrate } = useSuccessConfirm();
  const fr = locale === "fr";
  const [prefs, setPrefs] = useState<NoticePrefs | null>(null);
  const [saved, setSaved] = useState<NoticePrefs | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadLifecyclePrefs()
      .then((row) => {
        setEnabled(row.enabled);
        setPrefs(row.prefs);
        setSaved(row.prefs);
      })
      .catch(() => setEnabled(false));
  }, []);

  const dirty = Boolean(prefs && saved && JSON.stringify(prefs) !== JSON.stringify(saved));

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  if (!enabled || !prefs || !saved) return null;

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
      {dirty ? (
        <p className="mt-3 text-sm font-medium" role="status" data-ke="notice-dirty">
          {fr ? "Modifications non enregistrées" : "Unsaved changes"}
        </p>
      ) : null}
      <div className="mt-4">
        {NOTICE_CATEGORIES.map((category) => (
          <div key={category}>
            <SwitchRow
              id={`notice-${category}-email`}
              locale={locale}
              label={`${LABELS[category][fr ? "fr" : "en"]} · ${fr ? "Courriel" : "Email"}`}
              description={
                category === "tips"
                  ? fr
                    ? "Les conseils restent éteints tant que vous ne les ouvrez pas."
                    : "Tips stay off until you turn them on."
                  : fr
                    ? "Un avis par courriel pour cette catégorie."
                    : "An email notice for this category."
              }
              checked={prefs[category].email}
              onCheckedChange={(next) => setChoice(category, "email", next)}
            />
            {category === "tips" ? null : (
              <SwitchRow
                id={`notice-${category}-sms`}
                locale={locale}
                label={`${LABELS[category][fr ? "fr" : "en"]} · SMS`}
                description={
                  fr
                    ? "Les textos partent seulement si vous avez déjà accepté."
                    : "Texts go out only if you already agreed."
                }
                checked={prefs[category].sms}
                onCheckedChange={(next) => setChoice(category, "sms", next)}
              />
            )}
          </div>
        ))}
        <SwitchRow
          id="notice-unsubscribe"
          locale={locale}
          label={fr ? "Se désabonner de tout" : "Unsubscribe from all"}
          description={fr ? "Coupe tous ces avis." : "Stops all of these notices."}
          checked={prefs.unsubscribedAll}
          onCheckedChange={(next) => setPrefs({ ...prefs, unsubscribedAll: next })}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!dirty}
          onClick={() => {
            void saveLifecyclePrefs({ data: prefs })
              .then((result) => {
                setNote(result.ok ? (fr ? "Enregistré." : "Saved.") : fr ? "Éteint." : "Off.");
                if (result.ok) {
                  setSaved(prefs);
                  celebrate();
                }
              })
              .catch(() => setNote(fr ? "Pas enregistré." : "Not saved."));
          }}
        >
          {fr ? "Enregistrer" : "Save"}
        </Button>
        <Button type="button" variant="secondary" data-ke="notice-cancel" disabled={!dirty} onClick={() => setPrefs(saved)}>
          {fr ? "Annuler" : "Cancel"}
        </Button>
      </div>
      {note ? <p className="mt-2 text-sm" role="status">{note}</p> : null}
    </section>
  );
}
