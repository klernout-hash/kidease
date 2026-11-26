import { pickCardMicroPills } from "@/lib/card-micro-pills";
import { useSearchCardAges, useSearchCardWork } from "@/components/search-card-context";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import type { DaycareCard } from "@/lib/types";

/** `detourOnly`: search cards show the commute minutes pill only (S-N1). */
export function CardMicroPills({ item, detourOnly = false }: { item: DaycareCard; detourOnly?: boolean }) {
  const { locale } = useCopy();
  const ages = useSearchCardAges();
  const origin = useAppStore((s) => s.origin);
  const storeWork = useAppStore((s) => s.workOrigin);
  const searchWork = useSearchCardWork();
  const work = detourOnly ? searchWork : storeWork;
  const mode = useAppStore((s) => s.commuteMode);
  const homeReady = origin.label.trim().length > 0 && Number.isFinite(origin.lat);
  const picked = pickCardMicroPills({
    home: homeReady ? origin : null,
    work,
    stop: { lat: item.lat, lng: item.lng },
    mode,
    ageMinMonths: item.ageMinMonths,
    ageMaxMonths: item.ageMaxMonths,
    bands: ages,
    spotsUpdatedAt: item.spotsUpdatedAt || item.lastVacancyUpdatedAt,
    verified: Boolean(item.claimed && (item.licenseStatus === "active" || item.licenseStatus === "matched")),
  });
  const pills = detourOnly ? picked.filter((pill) => pill.id === "detour") : picked;
  if (!pills.length) return null;
  const fr = locale === "fr";
  return (
    <p className="mt-1 flex flex-wrap gap-1" data-ke="card-micro-pills">
      {pills.map((pill) => (
        <span
          key={pill.id}
          className={
            pill.id === "detour"
              ? "inline-flex min-h-6 items-center rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-900"
              : "inline-flex min-h-6 items-center rounded-full bg-stone-100 px-2 text-[11px] font-medium text-stone-700"
          }
        >
          {fr ? pill.fr : pill.en}
        </span>
      ))}
    </p>
  );
}
