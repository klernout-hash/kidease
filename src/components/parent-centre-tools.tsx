import { useEffect, useState } from "react";
import { money } from "@/lib/centre-tools";
import { centreToolsCopy } from "@/lib/centre-tools-copy";
import { listParentCentreTools } from "@/lib/server/centre-tools";
import { useCopy } from "@/lib/use-copy";

type Data = Awaited<ReturnType<typeof listParentCentreTools>>;

/** Parent view of menus, observations, bills, and test receipts. Each part follows its own off flag. */
export function ParentCentreToolsPanel() {
  const { locale } = useCopy();
  const copy = centreToolsCopy(locale);
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void listParentCentreTools().then(setData).catch(() => setData(null));
  }, []);
  if (!data || !data.kinds.length) {
    return (
      <section className="rounded-xl border p-5" data-testid="parent-centre-tools-off">
        <h2 className="font-display text-2xl">{copy.offTitle}</h2>
        <p className="mt-2">{copy.offBody}</p>
      </section>
    );
  }
  const names = new Map(data.children.map((c) => [c.bookingId, c.childName]));
  const of = (kind: string) => data.records.filter((r) => r.kind === kind);
  const empty = <p className="text-sm text-muted-foreground">{copy.noRows}</p>;
  return (
    <section className="space-y-6" data-testid="parent-centre-tools">
      <div>
        <h1 className="font-display text-3xl">{copy.parentTitle}</h1>
        <p className="mt-2 text-base">{copy.parentLead}</p>
      </div>
      {data.kinds.includes("menu") ? (
        <div className="rounded-xl border p-4">
          <h2 className="text-xl font-semibold">{copy.meals}</h2>
          {of("menu").slice(0, 2).map((r) => (
            <div key={r.id} className="mt-3">
              <p className="text-sm font-medium">{r.daycareName} · {copy.weekOf} {String(r.payload.weekOf)}</p>
              <ul className="mt-1 text-sm">
                {((r.payload.items as { day: string; slot: string; food: string }[]) || []).map((i, n) => (
                  <li key={n}><span className="capitalize">{i.day} {i.slot.replace(/_/g, " ")}</span>: {i.food}</li>
                ))}
              </ul>
              {((r.payload.allergens as string[]) || []).length ? <p className="mt-1 text-sm">{copy.allergens}: {(r.payload.allergens as string[]).join(", ").replace(/_/g, " ")}</p> : null}
              {r.payload.allergyNote ? <p className="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-900">{copy.allergyNote}: {String(r.payload.allergyNote)}</p> : null}
            </div>
          ))}
          {of("menu").length ? null : empty}
        </div>
      ) : null}
      {data.kinds.includes("observation") ? (
        <div className="rounded-xl border p-4">
          <h2 className="text-xl font-semibold">{copy.observations}</h2>
          <p className="text-xs text-muted-foreground">{copy.noPhotos}</p>
          <ul className="mt-2 divide-y text-sm">
            {of("observation").map((r) => (
              <li key={r.id} className="py-2">
                <strong>{names.get(r.bookingId || "")}</strong> · {String(r.payload.date)} · <span className="capitalize">{String(r.payload.domain)}</span> ({String(r.payload.level)})<br />
                {String(r.payload.note)}
              </li>
            ))}
          </ul>
          {of("observation").length ? null : empty}
        </div>
      ) : null}
      {data.kinds.includes("bill") || data.kinds.includes("tap_receipt") ? (
        <div className="rounded-xl border p-4">
          <h2 className="text-xl font-semibold">{copy.billHistory}</h2>
          <ul className="mt-2 divide-y text-sm">
            {of("bill").map((r) => (
              <li key={r.id} className="py-2">
                <strong>{names.get(r.bookingId || "")}</strong> · {String(r.payload.month)} · {copy.attendance}: {String(r.payload.attended)} · {copy.billed}: {String(r.payload.billedDays)}
                <br />
                {copy.parentShare}: ${money(Number(r.payload.parentCents) || 0)}
                {Number(r.payload.agencyCents) > 0 ? ` · ${copy.agencyShare} (${String(r.payload.agency)}): $${money(Number(r.payload.agencyCents))}` : ""}
              </li>
            ))}
            {of("tap_receipt").map((r) => (
              <li key={r.id} className="py-2">
                {copy.receipts} · {copy.tap} · {r.createdAt.slice(0, 10)} · ${money(Number(r.payload.amountCents) || 0)} · {copy.testNoCharge}
              </li>
            ))}
          </ul>
          {of("bill").length + of("tap_receipt").length ? null : empty}
        </div>
      ) : null}
    </section>
  );
}
