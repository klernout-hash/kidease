import { EarningsHeader } from "@/components/earnings-header";
import { EmptyState } from "@/components/empty-state";
import { KidBlocks } from "@/components/kid-art";
import { Button } from "@/components/ui/button";
import type { EarningsResult } from "@/lib/earnings-desk";
import { useCopy } from "@/lib/use-copy";
import { useEffect, useState } from "react";
import { createConnectAccountSession, listCentreIdsForPayouts } from "@/lib/server/connect-payments";
import { loadConnectInstance } from "@/lib/stripe-browser";

export function EarningsPayoutsScreen({
  desk,
  connect,
  centres = [],
}: {
  desk: EarningsResult | null;
  connect?: { enabled: boolean; ready: boolean; blockedLive: boolean; publishableKey: string | null } | null;
  centres?: { id: string; name: string }[];
}) {
  const { t } = useCopy();
  const body =
    desk && desk.ok
      ? desk.payouts === "on"
        ? t("earningsPayoutsOn")
        : desk.payouts === "off"
          ? t("earningsPayoutsOff")
          : t("earningsPayoutsLater")
      : null;
  return (
    <main className="ke-screen-enter ke-gutter mx-auto w-full max-w-lg pb-10 pt-4" data-ke="earnings-payouts">
      <EarningsHeader title={t("earningsPayoutSettings")} back={{ screen: "earnings" }} />
      <ConnectPayouts connect={connect ?? null} centres={centres} />
      {desk && !desk.ok ? (
        <div className="mt-6">
          <EmptyState title={t("actionFailed")} action={t("back")} actionTo="/menu" />
        </div>
      ) : null}
      {body ? (
        <div className="mt-6 rounded-[1.25rem] bg-surface p-5 ring-1 ring-border">
          <KidBlocks className="h-16 w-24 text-primary" />
          <p className="mt-4 text-base leading-6">{body}</p>
        </div>
      ) : null}
    </main>
  );
}

function ConnectPayouts({
  connect,
  centres: initialCentres,
}: {
  connect: { enabled: boolean; ready: boolean; blockedLive: boolean; publishableKey: string | null } | null;
  centres: { id: string; name: string }[];
}) {
  const { t } = useCopy();
  const [centres, setCentres] = useState(initialCentres);
  const [daycareId, setDaycareId] = useState(initialCentres[0]?.id ?? "");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = connect?.enabled === true;
  const ready = connect?.ready === true;
  const blockedLive = connect?.blockedLive === true;
  const publishableKey = connect?.publishableKey ?? null;

  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    void listCentreIdsForPayouts()
      .then((res) => {
        if (cancel || !res.enabled) return;
        setCentres(res.centres);
        if (res.centres[0]) setDaycareId(res.centres[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!started || !publishableKey || !daycareId) return;
    const node = document.getElementById("connect-payouts-mount");
    if (!node) return;
    let dead = false;
    void loadConnectInstance(publishableKey, async () => {
      const session = await createConnectAccountSession({ data: daycareId });
      if (!session.ok || !session.clientSecret) throw new Error("missing");
      return session.clientSecret;
    })
      .then((instance) => {
        if (!instance || dead) return;
        node.replaceChildren(instance.create("account-onboarding"), instance.create("payouts"));
      })
      .catch(() => {
        if (!dead) setError(t("actionFailed"));
      });
    return () => {
      dead = true;
    };
  }, [daycareId, publishableKey, started, t]);

  if (!enabled) return null;
  return (
    <section className="mt-6 rounded-[1.25rem] bg-surface p-5 ring-1 ring-border" data-ke="connect-payouts">
      <h2 className="font-display text-xl">{t("connectPayouts")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{t("connectEmbedded")}</p>
      {blockedLive ? <p className="mt-3 text-sm">{t("walletTestOnly")}</p> : null}
      {!ready && !blockedLive ? <p className="mt-3 text-sm">{t("connectNotSetUp")}</p> : null}
      {ready && centres.length > 1 ? (
        <label className="mt-4 block text-sm font-medium">
          {t("payCentre")}
          <select
            className="ke-input mt-1 min-h-11 w-full"
            value={daycareId}
            onChange={(event) => setDaycareId(event.target.value)}
          >
            {centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {ready && centres.length === 1 ? <p className="mt-3 text-sm">{centres[0]?.name}</p> : null}
      {ready && centres.length > 0 && !started ? (
        <Button type="button" className="mt-4 w-full" data-ke="connect-start" onClick={() => setStarted(true)}>
          {t("connectOnboarding")}
        </Button>
      ) : null}
      <div id="connect-payouts-mount" className="mt-4 min-h-11" />
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
