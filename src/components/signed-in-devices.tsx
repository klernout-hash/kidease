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
  const [busy, setBusy] = useState<"this" | "others" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  async function refresh() {
    const res = await listSignedInDevices();
    setDevices(res.devices);
  }

  useEffect(() => {
    void refresh().catch(() => setLoadFailed(true));
  }, []);

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
          </li>
        ))}
        {devices && devices.length === 0 ? <li className="text-sm text-muted">{t("devicesEmpty")}</li> : null}
        {devices === null && !error ? <li className="text-sm text-muted">{t("devicesLoading")}</li> : null}
      </ul>
      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("this")}>
          {busy === "this" ? t("devicesRevoking") : t("devicesRevokeThis")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("others")}>
          {busy === "others" ? t("devicesRevoking") : t("devicesRevokeOthers")}
        </Button>
      </div>
    </section>
  );
}
