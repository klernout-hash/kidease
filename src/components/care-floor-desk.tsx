import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HEALTH_CHECKS, TOILET_KINDS } from "@/lib/care-floor";
import { listCareFloor, saveCareFloor, type FloorWrite } from "@/lib/server/care-floor";
import { useCopy } from "@/lib/use-copy";

type Floor = Awaited<ReturnType<typeof listCareFloor>>;

function words(fr: boolean) {
  return fr
    ? {
        title: "Outils du local",
        roll: "Appel d'urgence",
        toilet: "Toilettes",
        pickup: "Départ autorisé",
        health: "Santé à l'arrivée",
        event: "Allergène ou incident",
        start: "Commencer l'appel",
        close: "Fermer et garder",
        save: "Enregistrer",
        accounted: "Présent",
        note: "Note",
        person: "Personne",
        confirm: "Je confirme cette personne",
        signature: "Signature (tapez le nom)",
        child: "Enfant",
        empty: "Rien n'est enregistré encore.",
        fail: "Ça n'a pas été enregistré.",
      }
    : {
        title: "Floor tools",
        roll: "Emergency roll",
        toilet: "Toileting",
        pickup: "Authorised pickup",
        health: "Health screen",
        event: "Allergen or incident",
        start: "Start the roll",
        close: "Close and keep the log",
        save: "Save",
        accounted: "Accounted for",
        note: "Note",
        person: "Person",
        confirm: "I confirm this person",
        signature: "Signature (type the name)",
        child: "Child",
        empty: "Nothing is saved yet.",
        fail: "That was not saved.",
      };
}

export function CareFloorDesk({ daycareId }: { daycareId: string }) {
  const { locale } = useCopy();
  const t = words(locale === "fr");
  const [floor, setFloor] = useState<Floor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [child, setChild] = useState("");
  const [toilet, setToilet] = useState<(typeof TOILET_KINDS)[number]>("diaper");
  const [note, setNote] = useState("");
  const [person, setPerson] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [eventKind, setEventKind] = useState<"allergen" | "incident">("incident");

  async function load() {
    const next = await listCareFloor({ data: { daycareId } }).catch(() => null);
    if (next) setFloor(next);
  }

  useEffect(() => {
    void load();
  }, [daycareId]);

  async function run(action: string, payload: Partial<FloorWrite>, bookingId?: string) {
    setBusy(true);
    setError("");
    const result = await saveCareFloor({ data: { daycareId, action, bookingId, payload } }).catch(() => null);
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || t.fail);
      return;
    }
    setNote("");
    setSignature("");
    setConfirmed(false);
    await load();
  }

  if (!floor?.ok) return null;
  const picked = floor.children.find((row) => row.bookingId === child) || floor.children[0];
  const open = floor.records.find((row) => row.kind === "roll" && !row.closedAt);
  const marks = Array.isArray(open?.payload.marks) ? (open?.payload.marks as Array<{ kind: string; name: string; accounted: boolean }>) : [];

  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="care-floor">
      <h3 className="font-display text-xl">{t.title}</h3>
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}

      <div className="mt-4" data-ke="care-roll">
        <h4 className="font-medium">{t.roll}</h4>
        <Button type="button" className="mt-2" disabled={busy || Boolean(open)} onClick={() => void run("roll_start", {})}>{t.start}</Button>
        {open ? (
          <ul className="mt-3 space-y-2">
            {floor.children.map((row) => (
              <li key={row.bookingId}>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={marks.some((mark) => mark.kind === "child" && mark.name === row.name && mark.accounted)} onChange={(event) => void run("roll_mark", { kind: "child", name: row.name, accounted: event.target.checked })} />
                  {row.name}
                </label>
              </li>
            ))}
            {floor.staff.map((name) => (
              <li key={name}>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" checked={marks.some((mark) => mark.kind === "staff" && mark.name === name && mark.accounted)} onChange={(event) => void run("roll_mark", { kind: "staff", name, accounted: event.target.checked })} />
                  {name} · {t.accounted}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {open ? <Button type="button" variant="secondary" className="mt-2" disabled={busy} onClick={() => void run("roll_close", {})}>{t.close}</Button> : null}
      </div>

      <div className="mt-6 grid gap-3" data-ke="care-toilet">
        <h4 className="font-medium">{t.toilet}</h4>
        <label className="text-sm">{t.child}
          <select className="ke-input mt-1 w-full" value={picked?.bookingId || ""} onChange={(event) => setChild(event.target.value)}>
            {floor.children.map((row) => <option key={row.bookingId} value={row.bookingId}>{row.name}</option>)}
          </select>
        </label>
        <label className="text-sm">{t.toilet}
          <select className="ke-input mt-1 w-full" value={toilet} onChange={(event) => setToilet(event.target.value as typeof toilet)}>
            {TOILET_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className="text-sm">{t.note}
          <input className="ke-input mt-1 w-full" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="button" disabled={busy || !picked} onClick={() => void run("toilet", { kind: toilet, note, child: picked?.name }, picked?.bookingId)}>{t.save}</Button>
      </div>

      <div className="mt-6" data-ke="care-pickup-verify">
        <h4 className="font-medium">{t.pickup}</h4>
        <label className="mt-2 block text-sm">{t.person}
          <input className="ke-input mt-1 w-full" value={person} onChange={(event) => setPerson(event.target.value)} />
        </label>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          {t.confirm}
        </label>
        <label className="mt-2 block text-sm">{t.signature}
          <input className="ke-input mt-1 w-full" value={signature} onChange={(event) => setSignature(event.target.value)} />
        </label>
        <Button type="button" className="mt-2" disabled={busy || !picked} onClick={() => void run("pickup", { person, allowed: picked?.pickups || [], confirmed, signature, child: picked?.name }, picked?.bookingId)}>{t.save}</Button>
      </div>

      <div className="mt-6" data-ke="care-health">
        <h4 className="font-medium">{t.health}</h4>
        {HEALTH_CHECKS.map((key) => (
          <label key={key} className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={checks[key] === true} onChange={(event) => setChecks((prev) => ({ ...prev, [key]: event.target.checked }))} />
            {key}
          </label>
        ))}
        <Button type="button" className="mt-2" disabled={busy || !picked} onClick={() => void run("health", { checks: { fever: checks.fever === true, rash: checks.rash === true, cough: checks.cough === true, vomiting: checks.vomiting === true }, child: picked?.name }, picked?.bookingId)}>{t.save}</Button>
      </div>

      <div className="mt-6" data-ke="care-event">
        <h4 className="font-medium">{t.event}</h4>
        <label className="mt-2 block text-sm">
          <select className="ke-input mt-1 w-full" value={eventKind} onChange={(event) => setEventKind(event.target.value as typeof eventKind)}>
            <option value="incident">incident</option>
            <option value="allergen">allergen</option>
          </select>
        </label>
        <label className="mt-2 block text-sm">{t.note}
          <input className="ke-input mt-1 w-full" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button type="button" className="mt-2" disabled={busy || !picked} onClick={() => void run("event", { kind: eventKind, note, child: picked?.name }, picked?.bookingId)}>{t.save}</Button>
      </div>

      <ul className="mt-6 space-y-2 text-sm" data-ke="care-floor-history">
        {floor.records.length ? floor.records.slice(0, 12).map((row) => (
          <li key={row.id} className="rounded-lg bg-bg px-3 py-2 ring-1 ring-border">
            {row.kind} · {row.createdAt?.slice(0, 16).replace("T", " ")}
          </li>
        )) : <li className="text-muted">{t.empty}</li>}
      </ul>
    </section>
  );
}
