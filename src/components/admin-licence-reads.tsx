import { useEffect, useState } from "react";
import { confirmLicenceRead, listLicenceReads, type LicenceReadRow } from "@/lib/server/admin-tools";
import { useCopy } from "@/lib/use-copy";

export function AdminLicenceReads() {
  const { t } = useCopy();
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<LicenceReadRow[]>([]);
  const [ready, setReady] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void listLicenceReads()
      .then((result) => {
        if (!live) return;
        setOn(result.on);
        setRows(result.rows);
      })
      .catch(() => {
        if (live) setOn(false);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!ready || !on) return null;

  async function confirm(id: string) {
    setError("");
    try {
      const result = await confirmLicenceRead({ data: id });
      if (!result.ok || result.approved !== false) {
        setError(t("adminLicenceConfirmFailed"));
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
      setConfirmId(null);
    } catch {
      setError(t("adminLicenceConfirmFailed"));
    }
  }

  return (
    <section className="mt-8" data-ke="admin-licence-reads">
      <h2 className="font-display text-2xl">{t("adminLicenceTitle")}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">{t("adminLicenceLead")}</p>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length ? (
        <ul className="mt-4 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border">
              <p className="font-medium">{row.centreName || t("adminLicenceUnknown")}</p>
              <p className="mt-1 text-sm">
                {t("adminLicenceNumber")}: {row.licenceNumber || "—"}
              </p>
              <p className="text-sm">
                {t("adminLicenceHolder")}: {row.holderName || "—"}
              </p>
              <p className="text-sm">
                {t("adminLicenceExpiry")}: {row.expiry || "—"}
              </p>
              {confirmId === row.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                    onClick={() => void confirm(row.id)}
                  >
                    {t("adminLicenceConfirm")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation"
                    onClick={() => setConfirmId(null)}
                  >
                    {t("adminToolCancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg touch-manipulation"
                  onClick={() => setConfirmId(row.id)}
                >
                  {t("adminLicenceReview")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">{t("adminLicenceEmpty")}</p>
      )}
    </section>
  );
}
