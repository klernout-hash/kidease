import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { listAdminContracts, type AdminContractRow } from "@/lib/server/contracts";
import { AdminContractsPanel } from "@/components/admin-contracts";
import type { DocusignConnectIssue } from "@/lib/docusign-errors";
import type { DocusignTemplateOption } from "@/lib/docusign-packs";
import { beforeLoadAdminDesk } from "@/lib/server/admin-route";
import { canVisitDesk } from "@/lib/desks";

export const Route = createFileRoute("/admin-contracts")({
  beforeLoad: beforeLoadAdminDesk,
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
  const [templates, setTemplates] = useState<DocusignTemplateOption[]>([]);
  const [defaults, setDefaults] = useState<{
    provider_agreement: string | null;
    enrolment_pack: string | null;
  }>({ provider_agreement: null, enrolment_pack: null });
  const [docusignError, setDocusignError] = useState<DocusignConnectIssue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const res = await listAdminContracts().catch(() => ({
      mode: "demo" as const,
      rows: [],
      templates: [],
      defaultTemplateIds: { provider_agreement: null, enrolment_pack: null },
      templateRole: "Provider",
      docusignError: null,
    }));
    setRows(res.rows);
    setMode(res.mode);
    setTemplates(res.templates || []);
    setDefaults(res.defaultTemplateIds || { provider_agreement: null, enrolment_pack: null });
    setDocusignError(res.docusignError || null);
  }

  const admin = Boolean(ready && session && canVisitDesk(session.desks, "admin", session.role));

  useEffect(() => {
    if (!user || !admin) return;
    void refresh();
  }, [user, admin]);

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
      <AdminContractsPanel
        rows={rows}
        mode={mode}
        templates={templates}
        defaultTemplateIds={defaults}
        docusignError={docusignError}
        busy={busy}
        setBusy={setBusy}
        onRefresh={refresh}
      />
    </DeskShell>
    </TwoFactorGate>
  );
}
