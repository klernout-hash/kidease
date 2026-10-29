import type { CareDeskRole } from "@/lib/daily-care";
import type { CareOpsPayload } from "@/lib/server/care-ops";
import type { AttendanceRow } from "@/lib/server/ops";
import { useCopy } from "@/lib/use-copy";

/**
 * Medication and incident forms used to collect a child's health details.
 * Those fields stay out of the UI. Saved rows in the database are not deleted.
 */
export function CareChildOps(props: {
  role: CareDeskRole;
  row: AttendanceRow;
  ops: CareOpsPayload;
  busy: string | null;
  setBusy: (value: string | null) => void;
  onReload: () => Promise<void>;
}) {
  void props;
  const { locale } = useCopy();
  return (
    <p className="mt-4 text-sm text-muted" data-ke="care-child-ops">
      {locale === "fr"
        ? "KidEase ne demande pas ici le nom, la date de naissance ou la santé d’un enfant."
        : "KidEase does not ask for a child’s name, birthdate, or health details here."}
    </p>
  );
}
