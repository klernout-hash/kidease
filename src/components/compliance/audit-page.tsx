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
      <p className="mt-2 text-sm">{locale === "fr" ? "Ceci est la préparation à l’effacement, pas un journal complet des accès." : "This is deletion readiness, not a complete access log."}</p>
      <Button asChild className="mt-4"><a href={locale === "fr" ? "/fr/gov" : "/gov"}>{locale === "fr" ? "Bureau du gouvernement" : "Government desk"}</a></Button>
    </ComplianceFrame>
  );
}
