import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { demandCopy } from "@/lib/compliance/demand";
import type { PackMode } from "@/lib/compliance/mode";
type Data = { enabled: boolean; mode: PackMode; province: string; quarter: string | null; rows: { area: string; ageKey: string; n: number | null; suppressed: boolean }[] };
export function GovDemandPage({ data, locale }: { data: Data; locale: "en" | "fr" }) {
  const copy = demandCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Demande de places" : "Space demand"} copy={copy} mode={data.mode} gov>
      <p>{data.province} {data.quarter}</p>
      {data.rows.length === 0 ? <p className="mt-3 text-sm">{copy.empty}</p> : null}
      <ul className="mt-3 space-y-2">
        {data.rows.map((row, i) => <li key={i}>{row.suppressed ? (locale === "fr" ? "Groupe caché" : "Hidden group") : `${row.area} ${row.ageKey}: ${row.n}`}</li>)}
      </ul>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
