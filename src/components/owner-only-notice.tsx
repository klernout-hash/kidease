import { Link, useRouterState } from "@tanstack/react-router";
import { providerDeskPath } from "@/lib/desk-nav";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/**
 * N-13: the one "This tab is for the centre owner" notice for every
 * owner-only desk key (insights, top rated, employees, screening,
 * inspections, subsidy, occupancy, staff hours export, delete account).
 * The server refuses these too. The link back to Today keeps it from being
 * a dead end.
 */
export function OwnerOnlyNotice({
  className,
  showToday = true,
}: {
  className?: string;
  showToday?: boolean;
}) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const today = providerDeskPath(pathname);
  return (
    <div
      className={cn(
        "rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border",
        className,
      )}
      data-ke="staff-owner-only"
      role="status"
    >
      <p>{t("employeeStaffForbidden")}</p>
      {showToday ? (
        <Link
          to={today}
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline touch-manipulation"
          data-ke="staff-owner-only-today"
        >
          {t("todayHome")}
        </Link>
      ) : null}
    </div>
  );
}
