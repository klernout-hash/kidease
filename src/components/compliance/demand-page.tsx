import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { demandCopy, type DemandReportData } from "@/lib/compliance/demand";
export function GovDemandPage({ data, locale }: { data: DemandReportData; locale: "en" | "fr" }) {
  const copy = demandCopy(locale);
  const router = useRouter();
  const pending = useRef(false);
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    if (pending.current) return;
    pending.current = true;
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the unavailable state if the retry itself cannot complete.
    } finally {
      pending.current = false;
      setRetrying(false);
    }
  }
  return (
    <ComplianceFrame locale={locale} title={copy.title} copy={copy} mode={data.mode} gov>
      <p>{data.province} {data.quarter}</p>
      {data.status === "unavailable" ? (
        <div className="mt-3" data-ke="demand-unavailable" aria-busy={retrying}>
          <p role="status" aria-live="polite">{retrying ? copy.retrying : copy.unavailable}</p>
          <Button type="button" className="mt-3 min-h-[44px]" disabled={retrying} onClick={() => void retry()}>
            {copy.retry}
          </Button>
        </div>
      ) : data.status === "ready" ? data.rows.some((row) => !row.suppressed) ? (
        <ul className="mt-3 space-y-2">
          {data.rows.filter((row) => !row.suppressed).map((row) => (
            <li key={`${row.area}-${row.ageKey}`}>{row.area} {row.ageKey}: {row.n}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">{copy.empty}</p>
      ) : null}
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
