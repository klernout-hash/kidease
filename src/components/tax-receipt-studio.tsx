import { useState } from "react";
import { buildRl24Summary, buildT778Receipt, receiptFileName } from "@/lib/tax-receipts";
import { useCopy } from "@/lib/use-copy";
import { Button } from "@/components/ui/button";

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function TaxReceiptStudio({ quebec = false }: { quebec?: boolean }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const year = new Date().getFullYear();
  const [receiptFor, setReceiptFor] = useState("");
  const [provider, setProvider] = useState("");
  const [amount, setAmount] = useState("");
  const [province, setProvince] = useState(quebec ? "QC" : "MB");
  const [permit, setPermit] = useState("");
  const [slip, setSlip] = useState("");
  const [note, setNote] = useState("");

  function saveT778() {
    const paid = Number(amount);
    if (!receiptFor.trim() || !provider.trim() || !Number.isFinite(paid)) {
      setNote(fr ? "Ajoutez la famille, le centre et le montant payé." : "Add the family, the centre, and the amount paid.");
      return;
    }
    const receipt = buildT778Receipt({
      taxYear: year,
      receiptFor,
      providerName: provider,
      amountPaid: paid,
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
    });
    download(receiptFileName("t778", year, receiptFor), receipt.text);
    setNote(fr ? "Reçu T778 téléchargé." : "T778 receipt downloaded.");
  }

  function saveRl24() {
    const paid = Number(amount);
    const summary = buildRl24Summary({
      taxYear: year,
      receiptFor,
      providerName: provider,
      permitOrNeq: permit,
      slipNumber: slip,
      boxA: Number.isFinite(paid) ? paid : 0,
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
    });
    if (!summary.ok) {
      setNote(fr ? "Le centre doit entrer son permis ou NEQ et le numéro de feuillet RL-24." : "The centre must enter its permit or NEQ and the RL-24 slip number.");
      return;
    }
    download(receiptFileName("rl24", year, receiptFor || "family"), summary.text);
    setNote(fr ? "Sommaire RL-24 téléchargé. Aucun code-barres inventé." : "RL-24 summary downloaded. No invented barcode.");
  }

  return (
    <section className="rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="tax-receipt-studio">
      <h2 className="font-display text-2xl">{fr ? "Reçus d'impôt" : "Tax receipts"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Le reçu montre la famille, le centre, le montant, la période et le numéro de reçu."
          : "The receipt shows the family, the centre, the amount, the period, and the receipt number."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Reçu pour" : "Receipt for"}</span>
          <input
            className="ke-input mt-1 w-full"
            value={receiptFor}
            autoComplete="name"
            onChange={(event) => setReceiptFor(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Centre" : "Centre"}</span>
          <input className="ke-input mt-1 w-full" value={provider} onChange={(event) => setProvider(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Province" : "Province"}</span>
          <input className="ke-input mt-1 w-full" value={province} maxLength={8} onChange={(event) => setProvince(event.target.value.toUpperCase())} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">{fr ? "Montant payé ($)" : "Amount paid ($)"}</span>
          <input className="ke-input mt-1 w-full" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, "").slice(0, 8))} />
        </label>
        {province === "QC" || quebec ? (
          <>
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Permis ou NEQ" : "Permit or NEQ"}</span>
              <input className="ke-input mt-1 w-full" value={permit} onChange={(event) => setPermit(event.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Numéro de feuillet RL-24" : "RL-24 slip number"}</span>
              <input className="ke-input mt-1 w-full" value={slip} onChange={(event) => setSlip(event.target.value)} />
            </label>
          </>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={saveT778}>{fr ? "Télécharger le T778" : "Download T778"}</Button>
        {province === "QC" || quebec ? (
          <Button type="button" variant="secondary" onClick={saveRl24}>{fr ? "Télécharger le RL-24" : "Download RL-24"}</Button>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-sm text-muted" role="status">{note}</p> : null}
    </section>
  );
}
