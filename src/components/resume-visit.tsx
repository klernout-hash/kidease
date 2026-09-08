import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readResumePath } from "@/lib/retention";
import { useCopy } from "@/lib/use-copy";

/** Returning-visitor CTA. Reads localStorage after mount so SSR stays empty. */
export function ResumeVisitCard({ className }: { className?: string }) {
  const { t } = useCopy();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(readResumePath());
  }, []);

  if (!href) return null;

  return (
    <div
      className={className ?? "mt-6 rounded-xl bg-surface p-4 ring-1 ring-border"}
      data-ke="resume-visit"
    >
      <p className="font-medium">{t("resumeVisitTitle")}</p>
      <p className="mt-1 text-sm text-muted">{t("resumeVisitLead")}</p>
      <Button asChild className="mt-3 min-h-11" size="sm">
        <a href={href}>{t("resumeVisitCta")}</a>
      </Button>
    </div>
  );
}
