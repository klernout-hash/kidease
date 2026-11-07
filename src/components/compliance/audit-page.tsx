import { ComplianceFrame } from "@/components/compliance/frame";
import { Button } from "@/components/ui/button";
import { auditCopy } from "@/lib/compliance/audit";
import type { PackMode } from "@/lib/compliance/mode";
type Data = { enabled: boolean; mode: PackMode; province: string; wouldDelete: number };
export function GovAuditPage({ data, locale }: { data: Data; locale: "en" | "fr" }) {
  const copy = auditCopy(locale);
  return (
    <ComplianceFrame locale={locale} title={locale === "fr" ? "Journal" : "Audit log"} copy={copy} mode={data.mode} gov>
      <p>{data.province}</p>
      <p className="mt-3">{locale === "fr" ? "Lignes prêtes à effacer" : "Rows ready to delete"}: {data.wouldDelete}</p>
      <p className="mt-2 text-sm" data-ke="gov-audit-limit">{locale === "fr" ? "Aucun événement d’accès, d’exportation ou de modification n’est listé ici. Le chiffre ci-dessus est seulement la préparation à l’effacement." : "No access, export, or change events are listed here. The number above is deletion readiness only."}</p>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
