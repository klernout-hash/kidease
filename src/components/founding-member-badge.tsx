import { foundingLocale } from "@/lib/founding-period";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function FoundingMemberBadge({
  show,
  className,
}: {
  show?: boolean | null;
  className?: string;
}) {
  const { locale } = useCopy();
  if (!show) return null;
  const label = foundingLocale(locale) === "fr" ? "Membre fondateur" : "Founding member";
  return (
    <span
      data-ke="founding-member"
      className={cn(
        "inline-flex min-h-6 items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary",
        className,
      )}
    >
      {label}
    </span>
  );
}
