import { useEffect, useState } from "react";
import { listCentreAgreementChips, type ParentAgreementChip } from "@/lib/server/parent-agreement";

export function useCentreAgreementChips() {
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<ParentAgreementChip[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void listCentreAgreementChips()
      .then((result) => {
        setEnabled(result.enabled);
        setRows(result.rows);
      })
      .catch(() => {
        setEnabled(false);
        setRows([]);
      });
  }, [tick]);
  return {
    enabled,
    rows,
    refresh: () => setTick((value) => value + 1),
    chipFor(bookingId: string) {
      return rows.find((row) => row.bookingId === bookingId && row.status !== "void") ?? null;
    },
  };
}
