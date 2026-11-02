import type { GovDashboard } from "@/lib/gov/aggregate";
import { govCopy } from "@/lib/gov/copy";

/** Same PDF and CSV the dashboard already builds. This page is the /gov/exports address. */
export function GovExportsPage({ data }: { data: GovDashboard }) {
  const copy = govCopy(data.locale);
  const query = new URLSearchParams();
  if (data.province) query.set("province", data.province);
  if (data.region && data.region !== "ALL") query.set("region", data.region);
  if (data.city && data.city !== "ALL") query.set("city", data.city);
  query.set("locale", data.locale);
  const pdf = `/api/gov/export?${query.toString()}&format=pdf`;
  const csv = `/api/gov/export?${query.toString()}&format=csv`;
  const home = data.locale === "fr" ? "/fr/gov" : "/gov";
  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <main className="mx-auto w-full max-w-3xl px-4 py-8" data-ke="gov-exports">
        <p className="text-sm font-medium text-muted">{copy.what}</p>
        <h1 className="mt-1 font-display text-3xl">{copy.exportsTitle}</h1>
        <p className="mt-2 max-w-2xl text-base">{copy.exportsWhy}</p>
        <p className="mt-2 text-sm text-muted">{data.placeLabel}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={pdf}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg touch-manipulation"
          >
            {copy.downloadPdf}
          </a>
          <a
            href={csv}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-5 text-sm font-medium touch-manipulation"
          >
            {copy.downloadCsv}
          </a>
        </div>
        <a href={home} className="mt-8 inline-flex min-h-11 items-center font-medium text-primary underline">
          {copy.exportsBack}
        </a>
      </main>
    </div>
  );
}
