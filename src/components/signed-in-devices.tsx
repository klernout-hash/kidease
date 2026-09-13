import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listSignedInDevices, revokeSignedInDevice, type SignedInDevice } from "@/lib/server/trusted-devices";
import { formatDeviceTime } from "@/lib/trusted-device";
import { signOut } from "@/lib/auth/client";

export function SignedInDevices() {
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [busy, setBusy] = useState<"this" | "others" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await listSignedInDevices();
    setDevices(res.devices);
  }

  useEffect(() => {
    void refresh().catch(() => setError("Could not load signed-in devices."));
  }, []);

  async function revoke(scope: "this" | "others") {
    if (scope === "this" && !window.confirm("Revoke this device and sign out here?")) return;
    if (scope === "others" && !window.confirm("Revoke every other signed-in device? This device stays signed in.")) {
      return;
    }
    setBusy(scope);
    setError(null);
    try {
      const res = await revokeSignedInDevice({ data: { scope } });
      if (res.signedOut) {
        toast.success("This device was revoked.");
        await signOut("/login");
        return;
      }
      toast.success("Other devices were revoked.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke devices.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="signed-in-devices">
      <h2 className="font-display text-lg tracking-[-0.02em]">Devices signed in</h2>
      <p className="mt-1 text-[13px] text-muted">
        This device, plus remembered browsers and active sessions we can see on the server.
        Revoke fails closed — if we cannot drop a session, nothing is marked done.
      </p>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-3">
        {(devices || []).map((row) => (
          <li key={row.id} className="rounded-lg bg-bg px-3 py-2.5 ring-1 ring-border">
            <p className="text-sm font-medium">
              {row.label}
              {row.current ? <span className="ml-2 text-[11px] uppercase tracking-wider text-primary">This device</span> : null}
            </p>
            <p className="mt-1 text-[12px] text-subtle">
              Last seen {formatDeviceTime(row.lastSeen)}
              {row.ip ? ` · ${row.ip}` : ""}
            </p>
          </li>
        ))}
        {devices && devices.length === 0 ? <li className="text-sm text-muted">No other sessions are visible.</li> : null}
        {devices === null && !error ? <li className="text-sm text-muted">Loading devices…</li> : null}
      </ul>
      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("this")}>
          {busy === "this" ? "Revoking…" : "Revoke this device"}
        </Button>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => void revoke("others")}>
          {busy === "others" ? "Revoking…" : "Revoke all other devices"}
        </Button>
      </div>
    </section>
  );
}
