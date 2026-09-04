import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { listAdminContracts, type AdminContractRow } from "@/lib/server/contracts";
import { AdminContractsPanel } from "@/components/admin-contracts";

export const Route = createFileRoute("/admin-contracts")({
  head: () => ({
    meta: [
      { title: "Admin contracts · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminContractsPage,
});

function AdminContractsPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [rows, setRows] = useState<AdminContractRow[]>([]);
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const res = await listAdminContracts().catch(() => ({ mode: "demo" as const, rows: [] }));
    setRows(res.rows);
    setMode(res.mode);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user]);

  const admin = Boolean(ready && session?.desks.includes("admin"));

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!admin) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This page is only for KidEase staff with profiles.role = admin.</p>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next="/admin-contracts">
    <DeskShell desk="admin" active="contracts" onSelect={(id) => {
      if (id !== "contracts" && typeof window !== "undefined") window.location.assign("/admin");
    }}>
      <AdminContractsPanel rows={rows} mode={mode} busy={busy} setBusy={setBusy} onRefresh={refresh} />
    </DeskShell>
    </TwoFactorGate>
  );
}
