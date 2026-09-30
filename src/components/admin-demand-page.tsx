import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canVisitDesk } from "@/lib/desks";
import { demandSupplyCsv, type DemandSupplyRow } from "@/lib/ranking/demand";
import { listDemandSupply, rebuildDemandSupply } from "@/lib/server/demand-supply";
import { useCopy } from "@/lib/use-copy";
import { Button } from "@/components/ui/button";

export function DemandPage() {
  const { t } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [rows, setRows] = useState<DemandSupplyRow[] | null>(null);
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role));

  useEffect(() => {
    if (!user || !admin) return;
    let live = true;
    void listDemandSupply()
      .then((report) => {
        if (!live) return;
        setDay(report.day);
        setRows(report.rows);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Could not load this table.");
      });
    return () => {
      live = false;
    };
  }, [user, admin]);

  async function rebuild() {
    setBusy(true);
    setError("");
    try {
      await rebuildDemandSupply();
      const report = await listDemandSupply();
      setDay(report.day);
      setRows(report.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("demandEmpty"));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const csv = demandSupplyCsv(rows ?? []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kidease-demand-${day || "table"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isPending || !ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next="/admin-demand">
      <DeskShell
        desk="admin"
        active="demand"
        onSelect={(id) => {
          if (id !== "demand" && typeof window !== "undefined") window.location.assign(`/admin?tab=${id}`);
        }}
      >
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="font-display text-3xl">{t("demandPageTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{t("demandPageLead")}</p>
          <p className="mt-2 text-sm text-muted">{day ? day : t("demandEmpty")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={download} disabled={!rows?.length || busy}>
              {t("demandDownload")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void rebuild()} disabled={busy}>
              {busy ? t("demandRebuilding") : t("demandRebuild")}
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-muted">{error}</p> : null}
          {rows && rows.length === 0 ? <p className="mt-6 text-sm text-muted">{t("demandEmpty")}</p> : null}
          {rows && rows.length > 0 ? (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-2 pr-3 font-medium">City</th>
                    <th className="py-2 pr-3 font-medium">Age</th>
                    <th className="py-2 pr-3 font-medium">Searches</th>
                    <th className="py-2 pr-3 font-medium">Saves</th>
                    <th className="py-2 pr-3 font-medium">Spot requests</th>
                    <th className="py-2 pr-3 font-medium">Listings</th>
                    <th className="py-2 font-medium">Confirmed openings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.city}-${row.ageGroup}`} className="border-b border-border">
                      <td className="py-2 pr-3">{row.city}</td>
                      <td className="py-2 pr-3">{row.ageGroup}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.searches}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.saves}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.spotRequests}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.listings}</td>
                      <td className="py-2 tabular-nums">{row.confirmedOpenings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </DeskShell>
    </TwoFactorGate>
  );
}
