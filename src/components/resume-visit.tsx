import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readResumePath } from "@/lib/retention";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Compact return pill. Reads localStorage after mount so SSR stays empty. */
export function ResumeVisitCard({ className }: { className?: string }) {
  const { t } = useCopy();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(readResumePath());
  }, []);

  if (!href) return null;

  return (
    <Button asChild variant="secondary" size="md" className={cn("whitespace-nowrap", className)}>
      <a href={href} data-ke="resume-visit">
        {t("resumeVisitPill")}
      </a>
    </Button>
  );
}
