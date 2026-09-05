import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { getLabStatus, type LabStatus } from "@/lib/server/chat-scaffold";
import { CHAT_SCAFFOLD_MESSAGE } from "@/lib/chat-scaffold";

export const Route = createFileRoute("/admin-chat")({
  head: () => ({
    meta: [
      { title: "Chat lab · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminChatPage,
});

function AdminChatPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const [lab, setLab] = useState<LabStatus | null>(null);

  useEffect(() => {
    if (!user) return;
    void getLabStatus()
      .then(setLab)
      .catch(() => setLab(null));
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
    <TwoFactorGate next="/admin-chat">
      <DeskShell
        desk="admin"
        active="chat"
        onSelect={(id) => {
          if (id !== "chat" && typeof window !== "undefined") window.location.assign("/admin");
        }}
      >
        <section className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Scaffold</p>
            <h2 className="mt-2 font-display text-2xl">In-app chat</h2>
            <p className="mt-2 max-w-xl text-sm text-muted">{CHAT_SCAFFOLD_MESSAGE}</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat
              label="FEATURE_INAPP_CHAT"
              value={lab?.chat.enabled ? "on" : "off"}
              hint="Flag only. Composer and delivery are not built."
            />
            <Stat
              label="FEATURE_PUSH"
              value={lab?.push.enabled ? "on" : "off"}
              hint={
                lab?.push.credentialsPresent
                  ? "Env names are present. Send stub still no-ops."
                  : "No FCM / APNs credentials. Do not invent keys."
              }
            />
            <Stat
              label="FEATURE_SMS"
              value={lab?.sms.enabled ? "on" : "off"}
              hint={smsHint(lab)}
            />
          </dl>
          <div className="rounded-2xl bg-surface px-5 py-6 text-sm text-muted ring-1 ring-border">
            <p>
              Live parent ↔ centre messages stay on{" "}
              <Link to="/inbox" className="text-fg underline">
                /inbox
              </Link>
              .
            </p>
            <p className="mt-2">
              No Stream or Sendbird. Types live in <code>src/lib/chat-scaffold.ts</code>.
            </p>
          </div>
        </section>
      </DeskShell>
    </TwoFactorGate>
  );
}

function smsHint(lab: LabStatus | null): string {
  if (!lab) return "Twilio env not loaded. Do not invent credentials.";
  const p = lab.sms.presence;
  const sender = p.messagingService ? "Messaging Service present" : p.fromNumber ? "From number present" : "no Canadian sender / Messaging Service";
  const auth = p.authMode === "api_key" ? "API key present" : p.authMode === "auth_token" ? "auth token present" : "no auth";
  if (lab.sms.credentialsPresent) {
    return `${auth}. ${sender}. Values are not shown.`;
  }
  return `No Twilio send credentials (${auth}; ${sender}). Do not invent SID or token values.`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-4 ring-1 ring-border">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{label}</dt>
      <dd className="mt-2 font-display text-2xl">{value}</dd>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
