import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KIOSK_SAMPLE, hashPin, kioskCopy, validPin } from "@/lib/amazon/kiosk-copy";
import { listDoorRoster, recordChildCheck } from "@/lib/server/child-checkin";
import { getFireKioskAccess } from "@/lib/server/fire-kiosk";
import { useCopy } from "@/lib/use-copy";

type Search = { preview?: string };

export const Route = createFileRoute("/kiosk")({
  validateSearch: (s: Record<string, unknown>): Search => ({ preview: s.preview ? String(s.preview) : undefined }),
  loader: () => getFireKioskAccess().catch(() => ({ allowed: false })),
  head: () => ({ meta: [{ title: "Check-in kiosk · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: KioskPage,
});

const PIN_KEY = "ke.kiosk.pin";
type Child = (typeof KIOSK_SAMPLE)[number];

function KioskPage() {
  const { allowed } = Route.useLoaderData();
  const { preview } = Route.useSearch();
  // Sample data preview is dev-only, for screenshots. Never in production builds.
  const previewMode = import.meta.env.DEV && preview === "1";
  const { locale } = useCopy();
  const copy = kioskCopy(locale);
  const [children, setChildren] = useState<Child[]>(previewMode ? KIOSK_SAMPLE : []);
  const [pickup, setPickup] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [exiting, setExiting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const active = allowed || previewMode;

  useEffect(() => {
    if (!active) return;
    setPinHash(localStorage.getItem(PIN_KEY));
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    orientation?.lock?.("landscape").catch(() => undefined);
    // Lock to this screen: swallow back navigation until staff exit with the PIN.
    history.pushState(null, "", location.href);
    const stay = () => history.pushState(null, "", location.href);
    window.addEventListener("popstate", stay);
    if (!previewMode) {
      listDoorRoster()
        .then((d) => setChildren((d?.enabled ? d.children : []) as Child[]))
        .catch(() => setChildren([]));
    }
    return () => window.removeEventListener("popstate", stay);
  }, [active, previewMode]);

  if (!active) {
    return (
      <main className="mx-auto max-w-xl p-8" data-ke="kiosk-off">
        <p className="text-muted">This page is not available on this device.</p>
      </main>
    );
  }

  async function check(child: Child) {
    const action = child.next;
    if (previewMode) {
      setChildren((cur) => cur.map((c) => (c.bookingId === child.bookingId ? { ...c, next: action === "check_in" ? "check_out" : "check_in" } : c)));
      setMessage(copy.done);
      return;
    }
    const res = await recordChildCheck({ data: { bookingId: child.bookingId, action, pickupName: pickup[child.bookingId] || "" } }).catch(() => null);
    setMessage(res?.ok ? copy.done : "");
    const d = await listDoorRoster().catch(() => null);
    if (d?.enabled) setChildren(d.children as Child[]);
  }

  async function submitPin() {
    if (!validPin(pinInput)) return setMessage(copy.wrongPin);
    const h = await hashPin(pinInput);
    setPinInput("");
    if (!pinHash) {
      localStorage.setItem(PIN_KEY, h);
      setPinHash(h);
      setMessage(copy.done);
      return;
    }
    if (h === pinHash && exiting) {
      window.location.href = "/dashboard";
      return;
    }
    setMessage(copy.wrongPin);
  }

  const needsPin = !pinHash || exiting;

  return (
    <main className="flex min-h-[100dvh] w-full flex-col gap-6 bg-bg p-8" data-ke="fire-kiosk" data-orientation="landscape">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">{copy.title}</h1>
          <p className="mt-1 text-lg text-muted">{copy.lead}</p>
          {previewMode ? <p className="mt-1 text-sm text-muted" data-ke="kiosk-preview">{copy.preview}</p> : null}
        </div>
        <div className="flex gap-3">
          <button type="button" className="min-h-16 rounded-2xl px-6 text-xl ring-1 ring-border" data-ke="help-button" onClick={() => setHelpOpen((v) => !v)}>
            ? {copy.help}
          </button>
          <button type="button" className="min-h-16 rounded-2xl px-6 text-xl ring-1 ring-border" data-ke="kiosk-exit" onClick={() => setExiting(true)}>
            {copy.exit}
          </button>
        </div>
      </header>
      {helpOpen ? (
        <p className="rounded-2xl bg-surface p-4 text-lg ring-1 ring-border" role="note">
          {copy.helpBody}
        </p>
      ) : null}
      {needsPin ? (
        <form
          className="flex items-end gap-3 rounded-2xl bg-surface p-4 ring-1 ring-border"
          data-ke="kiosk-pin"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPin();
          }}
        >
          <label className="flex flex-col text-lg">
            {pinHash ? copy.pin : copy.setPin}
            <input
              className="mt-2 min-h-16 w-56 rounded-xl px-4 text-2xl ring-1 ring-border"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </label>
          <button type="submit" className="min-h-16 rounded-2xl bg-indigo-700 px-8 text-xl font-semibold text-white">OK</button>
        </form>
      ) : null}
      {message ? <p role="status" className="text-xl">{message}</p> : null}
      {children.length ? (
        <ul className="grid grid-cols-2 gap-6 xl:grid-cols-4">
          {children.map((child) => (
            <li key={child.bookingId} className="flex flex-col gap-3 rounded-3xl bg-surface p-6 ring-1 ring-border">
              <p className="text-2xl font-medium">{child.childName}</p>
              <p className="text-muted">{child.daycareName}</p>
              {child.next === "check_out" && child.pickups.length ? (
                <select
                  aria-label={copy.pickup}
                  className="min-h-14 rounded-xl bg-surface px-3 text-lg ring-1 ring-border"
                  value={pickup[child.bookingId] || ""}
                  onChange={(e) => setPickup((cur) => ({ ...cur, [child.bookingId]: e.target.value }))}
                >
                  <option value="">{copy.pickup}</option>
                  {child.pickups.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className={`min-h-24 rounded-2xl text-3xl font-semibold text-white ${child.next === "check_in" ? "bg-emerald-600" : "bg-indigo-600"}`}
                onClick={() => void check(child)}
              >
                {child.next === "check_in" ? copy.checkIn : copy.checkOut}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xl text-muted">{copy.empty}</p>
      )}
    </main>
  );
}
