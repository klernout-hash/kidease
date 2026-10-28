import { useState } from "react";
import { ChipButton } from "@/components/chip";
import { CURRICULUM_TAGS, RATIO_PROVINCES, ratioRule, ratioStatus, type RatioProvince, type RoomBand } from "@/lib/provincial-ratios";
import { useCopy } from "@/lib/use-copy";

const BANDS: RoomBand[] = ["infant", "toddler", "preschool", "school-age"];
const BAND_LABEL: Record<RoomBand, { en: string; fr: string }> = {
  infant: { en: "Infant", fr: "Poupon" },
  toddler: { en: "Toddler", fr: "Tout-petit" },
  preschool: { en: "Preschool", fr: "Préscolaire" },
  "school-age": { en: "School-age", fr: "Âge scolaire" },
};

export function RatioBoard({ province = "MB" }: { province?: string }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const start = (RATIO_PROVINCES as readonly string[]).includes(province) ? (province as RatioProvince) : "MB";
  const [prov, setProv] = useState<RatioProvince>(start);
  const [counts, setCounts] = useState<Record<RoomBand, { children: string; staff: string }>>({
    infant: { children: "0", staff: "1" },
    toddler: { children: "0", staff: "1" },
    preschool: { children: "0", staff: "1" },
    "school-age": { children: "0", staff: "1" },
  });
  const [tags, setTags] = useState<string[]>([]);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80" data-ke="ratio-board">
      <h2 className="font-display text-2xl">{fr ? "Ratios du local" : "Room ratios"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Guide de planification. Confirmez le règlement auprès de votre ministère."
          : "A planning guide. Confirm the rule with your ministry."}
      </p>
      <label className="mt-3 block text-sm">
        <span className="font-medium">{fr ? "Province ou territoire" : "Province or territory"}</span>
        <select className="ke-input mt-1 w-full max-w-xs" value={prov} onChange={(event) => setProv(event.target.value as RatioProvince)}>
          {RATIO_PROVINCES.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      </label>
      <ul className="mt-4 space-y-3">
        {BANDS.map((band) => {
          const rule = ratioRule(prov, band);
          const status = ratioStatus(Number(counts[band].children), Number(counts[band].staff), rule);
          const tone = status === "out" ? "text-rose-800" : status === "near" ? "text-amber-800" : "text-emerald-800";
          const word = status === "out" ? (fr ? "Hors ratio" : "Out of ratio") : status === "near" ? (fr ? "Proche de la limite" : "Near the limit") : fr ? "Dans le ratio" : "Within ratio";
          return (
            <li key={band} className="rounded-2xl bg-stone-50 p-3">
              <p className="text-sm font-semibold">{fr ? BAND_LABEL[band].fr : BAND_LABEL[band].en}</p>
              <p className="text-xs text-muted">1:{rule.staffToChildren} · {fr ? "groupe max" : "max group"} {rule.maxGroup}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="text-sm">
                  {fr ? "Enfants" : "Children"}
                  <input
                    inputMode="numeric"
                    className="ke-input mt-1 w-24"
                    value={counts[band].children}
                    onChange={(event) => setCounts((prev) => ({ ...prev, [band]: { ...prev[band], children: event.target.value.replace(/[^\d]/g, "").slice(0, 3) } }))}
                  />
                </label>
                <label className="text-sm">
                  {fr ? "Personnel" : "Staff"}
                  <input
                    inputMode="numeric"
                    className="ke-input mt-1 w-24"
                    value={counts[band].staff}
                    onChange={(event) => setCounts((prev) => ({ ...prev, [band]: { ...prev[band], staff: event.target.value.replace(/[^\d]/g, "").slice(0, 2) } }))}
                  />
                </label>
              </div>
              <p className={`mt-2 text-sm font-medium ${tone}`}>{word}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <p className="text-sm font-medium">{fr ? "Programme éducatif" : "Early learning tags"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CURRICULUM_TAGS.map((tag) => {
            const on = tags.includes(tag.id);
            return (
              <ChipButton
                key={tag.id}
                on={on}
                aria-pressed={on}
                onClick={() => setTags((prev) => (on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]))}
              >
                {fr ? tag.fr : tag.en}
              </ChipButton>
            );
          })}
        </div>
      </div>
    </section>
  );
}
