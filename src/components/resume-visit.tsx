import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readResumePath } from "@/lib/retention";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Quiet return link. Reads localStorage after mount so SSR stays empty. */
export function ResumeVisitCard({ className, quiet = false }: { className?: string; quiet?: boolean }) {
  const { t } = useCopy();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    setHref(readResumePath());
  }, []);

  if (!href) return null;

  if (quiet) {
    return (
      <a
        href={href}
        data-ke="resume-visit"
        className={cn(
          "inline-flex min-h-11 items-center px-1 text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation",
          className,
        )}
      >
        {t("resumeVisitPill")}
      </a>
    );
  }

  return (
    <Button asChild variant="secondary" size="md" className={cn("whitespace-nowrap", className)}>
      <a href={href} data-ke="resume-visit">
        {t("resumeVisitPill")}
      </a>
    </Button>
  );
}
