import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { disconnectQbo, finishQboConnect, previewQboExport, qboStatus, saveQboAccounts, startQboConnect, syncQboExport } from "@/lib/server/qbo";
import type { QboAccountMap } from "@/lib/qbo-sync";

const EMPTY_ACCOUNTS: QboAccountMap = { parent_fees: "", stripe_clearing: "", platform_fee: "", gst_itc: "" };

export function QboPanel({ daycareId }: { daycareId: string }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const search = useSearch({ from: "/provider" });
  const navigate = useNavigate();
  const [missing, setMissing] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<QboAccountMap>(EMPTY_ACCOUNTS);
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const redeemed = useRef("");

  const load = useCallback(async () => {
    try {
      const status = await qboStatus({ data: { daycareId } });
      setMissing(status.missing);
      setConnected(status.connected);
    } catch {
      setMissing(["INTUIT_CLIENT_ID", "INTUIT_CLIENT_SECRET", "INTUIT_REDIRECT_URI", "INTUIT_ENVIRONMENT", "QBO_TOKEN_KEY"]);
      setConnected(false);
    } finally {
      setReady(true);
    }
  }, [daycareId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!search.qboCode || !search.qboState || !search.realmId) return;
    const key = `${search.qboState}:${search.realmId}`;
    if (redeemed.current === key) return;
    redeemed.current = key;
    let live = true;
    setBusy(true);
    void finishQboConnect({ data: { code: search.qboCode, state: search.qboState, realmId: search.realmId } })
      .then((result) => {
        if (!live) return;
        if (result.ok) toast.success(fr ? "QuickBooks est connecté." : "QuickBooks is connected.");
        else toast.error(fr ? "QuickBooks n'a pas accepté la connexion." : "QuickBooks did not accept the connection.");
      })
      .finally(() => {
        if (!live) return;
        setBusy(false);
        void load();
        void navigate({ to: "/provider", search: { desk: "money" }, replace: true });
      });
    return () => {
      live = false;
    };
  }, [search.qboCode, search.qboState, search.realmId, fr, load, navigate]);

  async function connect() {
    setBusy(true);
    try {
      const result = await startQboConnect({ data: { daycareId } });
      if (!result.ok) {
        setMissing(result.missing);
        toast.error(fr ? "QuickBooks n'est pas prêt." : "QuickBooks is not ready yet.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      toast.error(fr ? "QuickBooks n'est pas prêt." : "QuickBooks is not ready yet.");
    } finally {
      setBusy(false);
    }
  }

  async function previewExport() {
    setBusy(true);
    try {
      const result = await previewQboExport({ data: { daycareId } });
      if (!result.ok || result.rows.length === 0) {
        setPreview(fr ? "Aucune facture payée à exporter." : "No paid bills to export.");
        return;
      }
      const waiting = result.rows.filter((row) => !row.sent);
      const bad = waiting.some((row) => !row.balanced);
      setPreview(
        bad
          ? fr
            ? "Un montant ne balance pas. Rien n'a été envoyé."
            : "One amount does not balance. Nothing was sent."
          : fr
            ? `${waiting.length} factures prêtes. ${result.rows.length - waiting.length} déjà envoyées. Rien n'a été envoyé.`
            : `${waiting.length} bills are ready. ${result.rows.length - waiting.length} were already sent. Nothing was sent.`,
      );
    } catch {
      setPreview(fr ? "L'aperçu n'a pas abouti. Rien n'a été envoyé." : "The preview did not finish. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    try {
      const saved = await saveQboAccounts({ data: { daycareId, accounts } });
      if (!saved.ok) {
        toast.error(fr ? "Connectez QuickBooks d'abord." : "Connect QuickBooks first.");
        return;
      }
      const result = await syncQboExport({ data: { daycareId } });
      if (!result.ok) {
        const sent = "posted" in result ? result.posted : 0;
        toast.error(
          result.reason === "map"
            ? fr
              ? "Ajoutez les quatre numéros de compte."
              : "Add the four account numbers."
            : sent
              ? fr
                ? `${sent} écritures sont parties, puis QuickBooks a arrêté.`
                : `${sent} entries went through, then QuickBooks stopped.`
              : fr
                ? "QuickBooks n'a pas accepté l'envoi."
                : "QuickBooks did not accept the export.",
        );
        return;
      }
      toast.success(fr ? `${result.posted} écritures envoyées.` : `${result.posted} entries sent.`);
    } catch {
      toast.error(fr ? "QuickBooks n'a pas accepté l'envoi." : "QuickBooks did not accept the export.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="qbo-panel">
      <h2 className="font-display text-xl">{fr ? "QuickBooks en ligne" : "QuickBooks Online"}</h2>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Connectez le compte QuickBooks de ce centre. KidEase prépare les factures payées, le dépôt Stripe, les frais KidEase et une estimation de la TPS ou TVH. Les frais des parents restent exonérés."
          : "Connect the QuickBooks company this centre already uses. KidEase prepares paid bills, the Stripe deposit, the KidEase fee, and an estimated GST or HST split. Parent fees stay tax-exempt."}
      </p>
      <p className="mt-2 text-sm">
        {fr
          ? "KidEase n'est pas affilié à un gouvernement et ne produit pas votre déclaration. Confirmez la taxe avec votre comptable."
          : "KidEase is not government-affiliated and does not file your return. Confirm the tax line with your accountant."}
      </p>
      {!ready ? <p className="mt-4 text-sm text-muted">{fr ? "Vérification de QuickBooks…" : "Checking QuickBooks…"}</p> : null}
      {ready && missing.length ? (
        <p className="mt-4 text-sm" data-ke="qbo-missing">
          {fr ? "QuickBooks n'est pas connecté. Il manque encore ces réglages Intuit : " : "QuickBooks is not connected. These Intuit settings are still needed: "}
          {missing.join(", ")}.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {ready && missing.length === 0 && !connected ? (
          <Button type="button" className="min-h-11" disabled={busy} onClick={() => void connect()}>
            {fr ? "Connecter QuickBooks" : "Connect QuickBooks"}
          </Button>
        ) : null}
        {ready && connected ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void disconnectQbo({ data: { daycareId } }).then(() => {
                setConnected(false);
                setBusy(false);
              });
            }}
          >
            {fr ? "Déconnecter" : "Disconnect"}
          </Button>
        ) : null}
      </div>
      {ready && connected ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-muted">
            {fr
              ? "Écrivez les numéros de compte de votre propre plan QuickBooks. KidEase ne les choisit pas."
              : "Type the account numbers from your own QuickBooks chart. KidEase does not choose them."}
          </p>
          {(
            [
              ["parent_fees", fr ? "Frais des parents" : "Parent fees"],
              ["stripe_clearing", fr ? "Dépôt Stripe" : "Stripe deposit"],
              ["platform_fee", fr ? "Frais KidEase" : "KidEase fee"],
              ["gst_itc", fr ? "TPS ou TVH payée" : "GST or HST paid"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                inputMode="numeric"
                className="mt-1 w-full min-h-11 rounded-md border border-border bg-background px-3"
                value={accounts[key] || ""}
                onChange={(event) => setAccounts((prev) => ({ ...prev, [key]: event.target.value.replace(/\D/g, "").slice(0, 20) }))}
              />
            </label>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void previewExport()}>
              {fr ? "Voir l'export" : "Preview export"}
            </Button>
            <Button type="button" className="min-h-11" disabled={busy} onClick={() => void sync()}>
              {fr ? "Envoyer à QuickBooks" : "Send to QuickBooks"}
            </Button>
          </div>
          {preview ? <p className="text-sm">{preview}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
