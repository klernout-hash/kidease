import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readKioskHash } from "@/lib/qr-kiosk";
import { getKioskFrame, previewKioskCode, redeemKioskScan } from "@/lib/server/qr-kiosk";
import { useCopy } from "@/lib/use-copy";

const STASH = "kidease-kiosk-code";

function copy(fr: boolean) {
  return fr
    ? {
        tabletKicker: "Garderie",
        tabletTitle: "Écran d’arrivée",
        tabletWhat: "Les parents balayent ce code pour noter l’arrivée ou le départ.",
        tabletWhy: "Le code change souvent. Une vieille photo ne fonctionne pas.",
        tabletWait: "Le code se prépare.",
        tabletKey: "L’écran a besoin d’une clé de signature avant d’afficher un code.",
        tabletCentre: "Ouvrez cet écran à partir de la garderie que vous gérez.",
        scanTitle: "Balayer le code de la garderie",
        scanWhat: "KidEase note l’arrivée ou le départ de votre enfant.",
        scanWhy: "Utilisez le code affiché sur la tablette de la garderie.",
        scanEmpty: "Aucun enfant inscrit à ce centre.",
        checkIn: "Noter l’arrivée",
        checkOut: "Noter le départ",
        bad: "Ce code ne fonctionne plus. Balayez le code à l’écran.",
        doneIn: "Arrivée notée.",
        doneOut: "Départ noté.",
        already: "C’est déjà noté pour ce code.",
        child: "Enfant",
      }
    : {
        tabletKicker: "Daycare",
        tabletTitle: "Check-in screen",
        tabletWhat: "Parents scan this code to check a child in or out.",
        tabletWhy: "The code changes often. An old photo of the screen will not work.",
        tabletWait: "The code is getting ready.",
        tabletKey: "This screen needs a signing key before it can show a code.",
        tabletCentre: "Open this screen from the daycare you manage.",
        scanTitle: "Scan the daycare code",
        scanWhat: "KidEase records your child's check-in or check-out.",
        scanWhy: "Use the code on the daycare tablet.",
        scanEmpty: "No enrolled child at this centre.",
        checkIn: "Check in",
        checkOut: "Check out",
        bad: "That code no longer works. Scan the one on the screen.",
        doneIn: "Checked in.",
        doneOut: "Checked out.",
        already: "That is already recorded for this code.",
        child: "Child",
      };
}

export function KioskTablet({ daycareId }: { daycareId?: string }) {
  const { locale } = useCopy();
  const t = copy(locale === "fr");
  const [frame, setFrame] = useState<Awaited<ReturnType<typeof getKioskFrame>> | null>(null);

  useEffect(() => {
    let cancel = false;
    let timer = 0;
    async function load() {
      const next = await getKioskFrame({ data: { daycareId } }).catch(() => null);
      if (cancel || !next) return;
      setFrame(next);
      if (next.enabled && next.ready) {
        const wait = Math.max(1000, next.expiresAt - Date.now());
        timer = window.setTimeout(() => void load(), wait);
      }
    }
    void load();
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [daycareId]);

  if (!frame?.enabled) return null;
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="qr-kiosk">
      <p className="text-sm font-semibold text-primary">{t.tabletKicker}</p>
      <h2 className="mt-1 font-display text-2xl">{t.tabletTitle}</h2>
      <p className="mt-2 text-sm text-muted">{t.tabletWhat}</p>
      <p className="mt-1 text-sm text-muted">{t.tabletWhy}</p>
      {frame.ready ? (
        <div className="mt-4 max-w-xs">
          <div
            className="aspect-square w-full max-w-full"
            role="img"
            aria-label={frame.centreName ? `${t.tabletTitle}. ${frame.centreName}` : t.tabletTitle}
            dangerouslySetInnerHTML={{ __html: frame.svg }}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">{frame.reason === "key" ? t.tabletKey : frame.reason === "centre" ? t.tabletCentre : t.tabletWait}</p>
      )}
    </section>
  );
}

export function KioskParentScan() {
  const { locale } = useCopy();
  const t = copy(locale === "fr");
  const [token, setToken] = useState("");
  const [centre, setCentre] = useState("");
  const [children, setChildren] = useState<Array<{ id: string; name: string }>>([]);
  const [childId, setChildId] = useState("");
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromHash = typeof window !== "undefined" ? readKioskHash(window.location.hash) : "";
    let stored = "";
    try {
      stored = sessionStorage.getItem(STASH) || "";
    } catch {
      stored = "";
    }
    const next = fromHash || stored;
    if (!next) return;
    setToken(next);
    try {
      sessionStorage.setItem(STASH, next);
    } catch {
      /* private mode */
    }
    void previewKioskCode({ data: { token: next } })
      .then((res) => {
        if (!res.enabled) return;
        setEnabled(true);
        setReady(true);
        if (!res.ok) {
          toast.error(t.bad);
          return;
        }
        setCentre(res.centreName);
        setChildren(res.children);
        setChildId(res.children[0]?.id || "");
      })
      .catch(() => setReady(true));
  }, [t.bad]);

  if (!enabled) return null;

  async function redeem(action: "check_in" | "check_out") {
    setBusy(true);
    try {
      const res = await redeemKioskScan({ data: { token, childId, action } });
      if (!res.ok) {
        toast.error(res.reason === "already" ? t.already : t.bad);
        return;
      }
      toast.success(res.status === "arrived" ? t.doneIn : t.doneOut);
    } catch {
      toast.error(t.bad);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="qr-kiosk-scan">
      <h2 className="font-display text-2xl">{t.scanTitle}</h2>
      <p className="mt-2 text-sm text-muted">{t.scanWhat}</p>
      <p className="mt-1 text-sm text-muted">{t.scanWhy}</p>
      {centre ? <p className="mt-3 font-medium">{centre}</p> : null}
      {ready && children.length === 0 ? <p className="mt-3 text-sm text-muted">{t.scanEmpty}</p> : null}
      {children.length > 1 ? (
        <label className="mt-3 block text-sm">
          {t.child}
          <select
            className="mt-1 h-11 w-full rounded-full bg-bg px-3 ring-1 ring-border"
            value={childId}
            onChange={(event) => setChildId(event.target.value)}
          >
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !childId} onClick={() => void redeem("check_in")}>
          {t.checkIn}
        </Button>
        <Button type="button" variant="secondary" disabled={busy || !childId} onClick={() => void redeem("check_out")}>
          {t.checkOut}
        </Button>
      </div>
    </section>
  );
}

/** Keep a scanned code across the sign-in screen. Does not show the code. */
export function stashKioskHash() {
  if (typeof window === "undefined") return;
  const token = readKioskHash(window.location.hash);
  if (!token) return;
  try {
    sessionStorage.setItem(STASH, token);
  } catch {
    /* private mode */
  }
}
