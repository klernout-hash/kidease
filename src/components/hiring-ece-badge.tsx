import { Link } from "@tanstack/react-router";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

export function HiringEceBadge({ show }: { show: boolean }) {
  const { locale } = useCopy();
  if (!show) return null;
  const fr = locale === "fr";
  return (
    <Link
      to={localePath("/jobs", locale)}
      className="mt-2 inline-flex min-h-11 items-center rounded-full bg-rose-50 px-3 text-sm font-semibold text-rose-900 ring-1 ring-rose-200"
      data-ke="hiring-ece"
    >
      {fr ? "Embauche EPE / GAE" : "Hiring ECE / CCA"}
    </Link>
  );
}
