import { useState } from "react";
import { ChipButton } from "@/components/chip";
import { isCommuteMode, type CommuteMode } from "@/lib/commute-isochrone";
import { resolveLocationQuery } from "@/components/place-search";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";

const MODES: CommuteMode[] = ["drive", "transit", "walk", "bike"];

const LABEL: Record<CommuteMode, { en: string; fr: string }> = {
  drive: { en: "Drive", fr: "Auto" },
  transit: { en: "Transit", fr: "Transport" },
  walk: { en: "Walk", fr: "Marche" },
  bike: { en: "Bike", fr: "Vélo" },
};

export function CommuteDetourBar() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const origin = useAppStore((s) => s.origin);
  const work = useAppStore((s) => s.workOrigin);
  const setWork = useAppStore((s) => s.setWorkOrigin);
  const mode = useAppStore((s) => s.commuteMode);
  const setMode = useAppStore((s) => s.setCommuteMode);
  const [workText, setWorkText] = useState(work?.label ?? "");
  const [miss, setMiss] = useState(false);

  async function saveWork() {
    const hit = await resolveLocationQuery(workText);
    if (!hit) {
      setMiss(true);
      return;
    }
    setMiss(false);
    setWork(hit);
    setWorkText(hit.label);
  }

  return (
    <section className="mt-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80" data-ke="commute-detour-bar">
      <p className="text-sm font-semibold text-fg">{fr ? "Détour sur votre trajet" : "Commute detour"}</p>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Maison vers travail. Les minutes sont une estimation en ligne droite, pas un itinéraire en direct."
          : "Home to work. Minutes are a straight-line estimate, not a live route."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Maison" : "Home"}</span>
          <input className="ke-input mt-1 w-full" readOnly value={origin.label || (fr ? "Choisissez un lieu" : "Choose a place")} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Travail" : "Work"}</span>
          <span className="mt-1 flex gap-2">
            <input
              className="ke-input min-w-0 flex-1"
              value={workText}
              maxLength={80}
              onChange={(event) => setWorkText(event.target.value)}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
            />
            <ChipButton className="shrink-0" onClick={() => void saveWork()}>
              {fr ? "OK" : "Set"}
            </ChipButton>
          </span>
        </label>
      </div>
      {miss ? <p className="mt-2 text-sm text-muted">{fr ? "Lieu introuvable. Essayez une ville." : "Place not found. Try a city."}</p> : null}
      <div className="mt-3 flex gap-2 overflow-x-auto" role="group" aria-label={fr ? "Mode de trajet" : "Commute mode"}>
        {MODES.map((item) => (
          <ChipButton
            key={item}
            on={mode === item}
            className="shrink-0"
            aria-pressed={mode === item}
            onClick={() => {
              if (isCommuteMode(item)) setMode(item);
            }}
          >
            {fr ? LABEL[item].fr : LABEL[item].en}
          </ChipButton>
        ))}
        {work ? (
          <ChipButton
            className="shrink-0"
            onClick={() => {
              setWork(null);
              setWorkText("");
            }}
          >
            {fr ? "Effacer le travail" : "Clear work"}
          </ChipButton>
        ) : null}
      </div>
    </section>
  );
}
