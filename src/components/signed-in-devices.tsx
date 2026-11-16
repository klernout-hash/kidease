import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listSignedInDevices, revokeSignedInDevice, type SignedInDevice } from "@/lib/server/trusted-devices";
import { formatDeviceTime } from "@/lib/trusted-device";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";

export function SignedInDevices() {
  const { t, locale } = useCopy();
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  async function refresh() {
    const res = await listSignedInDevices();
    setDevices(res.devices);
  }

  useEffect(() => {
    void refresh().catch(() => setLoadFailed(true));
    void import("@/lib/persistent-session-client")
      .then((mod) => mod.persistentSessionsOn())
      .then(setPersistent)
      .catch(() => setPersistent(false));
  }, []);

  async function dropThisPhone() {
    const { releasePushOnSignOut } = await import("@/lib/push-client");
    await releasePushOnSignOut().catch(() => undefined);
  }

  async function revokeOne(row: SignedInDevice) {
    if (!window.confirm(t("devicesSignOutOneConfirm"))) return;
    setBusy(row.id);
    setError(null);
    try {
      if (row.current) await dropThisPhone();
      const res = await revokeSignedInDevice({ data: { id: row.id } });
      if (res.signedOut) {
        const { endPersistentSession } = await import("@/lib/persistent-session-client");
        await endPersistentSession().catch(() => undefined);
        toast.success(t("devicesSignedOutOne"));
        await signOut("/login");
        return;
      }
      toast.success(t("devicesSignedOutOne"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("devicesRevokeFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function revokeEverywhere() {
    if (!window.confirm(t("devicesSignOutEverywhereConfirm"))) return;
    setBusy("everywhere");
    setError(null);
    try {
      await dropThisPhone();
      const res = await revokeSignedInDevice({ data: { everywhere: true } });
      if (res.signedOut) {
        const { endPersistentSession } = await import("@/lib/persistent-session-client");
        await endPersistentSession().catch(() => undefined);
        toast.success(t("devicesSignedOutEverywhere"));
        await signOut("/login");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("devicesRevokeFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(scope: "this" | "others") {
    if (scope === "this" && !window.confirm(t("devicesRevokeThisConfirm"))) return;
    if (scope === "others" && !window.confirm(t("devicesRevokeOthersConfirm"))) {
      return;
    }
    setBusy(scope);
    setError(null);
    try {
      const res = await revokeSignedInDevice({ data: { scope } });
      if (res.signedOut) {
        toast.success(t("devicesRevokedThis"));
        await signOut("/login");
        return;
      }
      toast.success(t("devicesRevokedOthers"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("devicesRevokeFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="signed-in-devices">
      <h2 className="font-display text-lg tracking-[-0.02em]">{t("devicesTitle")}</h2>
      <p className="mt-1 text-[13px] text-muted">{t("devicesLead")}</p>
      {loadFailed ? <p className="mt-3 text-sm text-danger">{t("devicesLoadFailed")}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-3">
        {(devices || []).map((row) => (
          <li key={row.id} className="rounded-lg bg-bg px-3 py-2.5 ring-1 ring-border">
            <p className="text-sm font-medium">
              {row.label}
              {row.current ? <span className="ml-2 text-[11px] uppercase tracking-wider text-primary">{t("devicesThis")}</span> : null}
            </p>
            <p className="mt-1 text-[12px] text-subtle">
              {t("devicesLastSeen").replace("{when}", formatDeviceTime(row.lastSeen, locale) || t("devicesUnknownTime"))}
              {row.ip ? ` · ${row.ip}` : ""}
            </p>
            {persistent ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-2 min-h-11"
                disabled={busy !== null}
                onClick={() => void revokeOne(row)}
              >
                {busy === row.id ? t("devicesRevoking") : t("devicesSignOutOne")}
              </Button>
            ) : null}
          </li>
        ))}
        {devices && devices.length === 0 ? <li className="text-sm text-muted">{t("devicesEmpty")}</li> : null}
        {devices === null && !error ? <li className="text-sm text-muted">{t("devicesLoading")}</li> : null}
      </ul>
      {persistent ? (
        <div className="mt-4">
          <Button type="button" variant="secondary" className="min-h-11 w-full" disabled={busy !== null} onClick={() => void revokeEverywhere()}>
            {busy === "everywhere" ? t("devicesRevoking") : t("devicesSignOutEverywhere")}
          </Button>
        </div>
      ) : persistent === false ? (
      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("this")}>
          {busy === "this" ? t("devicesRevoking") : t("devicesRevokeThis")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("others")}>
          {busy === "others" ? t("devicesRevoking") : t("devicesRevokeOthers")}
        </Button>
      </div>
      ) : null}
    </section>
  );
}
