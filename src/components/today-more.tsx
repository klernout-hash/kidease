import { useEffect, useState, type ReactNode } from "react";

/**
 * Records and settings on Today (audit log, safe arrival, certificates, health log, jobs).
 * Clean look folds them under one heading so the first screen is what needs doing now.
 * Today's look keeps them open, as before.
 */
export function TodayMore({ locale, children }: { locale: "en" | "fr"; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (document.documentElement.dataset.look === "clean") setOpen(false);
  }, []);
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-6 rounded-xl ring-1 ring-border"
      data-ke="today-more"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-base font-semibold text-fg">
        {locale === "fr" ? "Dossiers et réglages du centre" : "Centre records and settings"}
      </summary>
      <div className="space-y-4 px-2 pb-4">{children}</div>
    </details>
  );
}
