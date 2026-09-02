import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { BuildingPhoto } from "@/components/building-photo";
import { listingThumb } from "@/lib/listing-photo";
import { Button } from "@/components/ui/button";
import { getDaycaresByIds } from "@/lib/server/daycares";
import { clearCompare, readCompare, toggleCompare } from "@/lib/compare";
import { useCopy } from "@/lib/use-copy";
import { money } from "@/lib/utils";
import { licenseRegistryUrl } from "@/lib/licensing";
import type { DaycareCard } from "@/lib/types";

export const Route = createFileRoute("/compare")({ component: ComparePage });

function ComparePage() {
  const { t, locale } = useCopy();
  const [items, setItems] = useState<DaycareCard[]>([]);

  useEffect(() => {
    const ids = readCompare();
    if (!ids.length) {
      setItems([]);
      return;
    }
    void getDaycaresByIds({ data: ids }).then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-6xl py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-4xl">{t("compareTitle")}</h1>
            <p className="mt-2 text-muted">{t("compareEmpty")}</p>
          </div>
          <Button variant="secondary" onClick={() => { clearCompare(); setItems([]); }}>
            {t("clearCompare")}
          </Button>
        </div>
        {items.length ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2" />
                  {items.map((d) => (
                    <th key={d.id} className="p-2 align-bottom">
                      <BuildingPhoto src={listingThumb(d.photos)} className="mb-2 aspect-[4/3] w-full rounded-lg object-cover" />
                      <Link to="/daycare/$slug" params={{ slug: d.slug }} className="font-semibold hover:underline">
                        {locale === "fr" ? d.nameFr : d.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-muted">
                <Row label={t("cityLabel")} values={items.map((d) => d.city)} />
                <Row label={t("hours")} values={items.map((d) => d.hours)} />
                <Row
                  label={t("pricing")}
                  values={items.map((d) => (d.live && d.fromPrice > 0 ? money(d.fromPrice, locale) : t("feeUnknown")))}
                />
                <Row
                  label={t("availability")}
                  values={items.map((d) =>
                    d.live || d.availabilityKnown
                      ? d.spotsTotal > 0
                        ? `${d.spotsTotal} ${t("spots")}`
                        : t("waitlist")
                      : t("availUnknown"),
                  )}
                />
                <Row label={t("googleReviews")} values={items.map((d) => (d.reviewCount ? `${(d.ratingX10 / 10).toFixed(1)} (${d.reviewCount})` : "—"))} />
                <Row label={t("license")} values={items.map((d) => d.licenseNumber ?? "—")} />
                <tr>
                  <th className="p-2 text-fg">{t("license")}</th>
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <a href={licenseRegistryUrl(d.province)} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {t("viewLicenceRecord")}
                      </a>
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="p-2" />
                  {items.map((d) => (
                    <td key={d.id} className="p-2">
                      <button type="button" className="text-sm text-muted hover:text-fg" onClick={() => { toggleCompare(d.id); setItems((rows) => rows.filter((r) => r.id !== d.id)); }}>
                        {t("clearCompare")}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-10 rounded-xl bg-surface p-8 text-center text-muted ring-1 ring-border">
            <Link to="/search" className="text-primary hover:underline">{t("explore")}</Link>
          </p>
        )}
      </main>
      <SiteFooter />
    </Shell>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-border">
      <th className="p-2 font-medium text-fg">{label}</th>
      {values.map((v, i) => (
        <td key={i} className="p-2">{v}</td>
      ))}
    </tr>
  );
}
