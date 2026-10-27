import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConnectPublicState, WalletMethodView } from "@/lib/connect-payments";
import { useCopy } from "@/lib/use-copy";
import { loadStripeClient, paymentElementOptions } from "@/lib/stripe-browser";
import { createWalletSetup, listWalletMethods, removeWalletMethod, updateWalletMethod } from "@/lib/server/connect-payments";

type Screen = "list" | "add" | "detail";

function BrandMark({ kind, brand }: { kind: WalletMethodView["kind"]; brand: string }) {
  const letter = kind === "apple_pay" ? "A" : kind === "google_pay" ? "G" : kind === "acss_debit" ? "B" : brand.slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-semibold text-primary"
    >
      {letter}
    </span>
  );
}

export function ParentWallet({ state }: { state: ConnectPublicState }) {
  const { t } = useCopy();
  const [screen, setScreen] = useState<Screen>("list");
  const [methods, setMethods] = useState<WalletMethodView[]>([]);
  const [selected, setSelected] = useState<WalletMethodView | null>(null);
  const [nickname, setNickname] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!state.ready) return;
    let cancel = false;
    void listWalletMethods()
      .then((res) => {
        if (!cancel && res.ok) setMethods(res.methods);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [state.ready]);

  function openDetail(method: WalletMethodView) {
    setSelected(method);
    setNickname(method.nickname || "");
    setExpMonth(method.expMonth ? String(method.expMonth) : "");
    setExpYear(method.expYear ? String(method.expYear) : "");
    setEditing(false);
    setScreen("detail");
  }

  async function refresh() {
    const res = await listWalletMethods();
    if (res.ok) setMethods(res.methods);
  }

  if (!state.enabled) return null;

  return (
    <section className="mt-8" data-ke="parent-wallet">
      {screen !== "list" ? (
        <button
          type="button"
          className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium touch-manipulation"
          onClick={() => setScreen("list")}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t("walletBack")}
        </button>
      ) : (
        <>
          <h2 className="font-display text-2xl">{t("walletTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{t("walletLead")}</p>
        </>
      )}
      {state.blockedLive ? <p className="mt-4 text-sm">{t("walletTestOnly")}</p> : null}
      {!state.ready && !state.blockedLive ? <p className="mt-4 text-sm">{t("walletNotSetUp")}</p> : null}
      {state.ready && screen === "list" ? (
        <ul className="mt-4 divide-y divide-border rounded-[1.25rem] bg-surface ring-1 ring-border">
          {methods.length === 0 ? <li className="px-4 py-4 text-sm text-muted">{t("walletEmpty")}</li> : null}
          {methods.map((method) => (
            <li key={method.id}>
              <button
                type="button"
                className="flex min-h-16 w-full items-center gap-3 px-3 py-3 text-left touch-manipulation"
                data-ke="wallet-row"
                onClick={() => openDetail(method)}
              >
                <BrandMark kind={method.kind} brand={method.brand} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {method.brand} ···· {method.last4}
                  </span>
                  {method.nickname ? <span className="block truncate text-sm text-muted">{method.nickname}</span> : null}
                  {method.isDefault ? <span className="block text-sm text-muted">{t("walletDefault")}</span> : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="flex min-h-14 w-full items-center px-4 text-[15px] font-medium text-primary touch-manipulation"
              data-ke="wallet-add"
              onClick={() => setScreen("add")}
            >
              {t("walletAdd")}
            </button>
          </li>
        </ul>
      ) : null}
      {state.ready && screen === "add" ? (
        <AddMethod
          state={state}
          onDone={() => {
            void refresh();
            setScreen("list");
          }}
        />
      ) : null}
      {state.ready && screen === "detail" && selected ? (
        <div data-ke="wallet-detail">
          <div className="flex items-center gap-3">
            <BrandMark kind={selected.kind} brand={selected.brand} />
            <div>
              <p className="text-lg font-semibold">
                {selected.brand} ···· {selected.last4}
              </p>
              {selected.expMonth && selected.expYear ? (
                <p className="text-sm text-muted">
                  {t("walletExpiry").replace("{date}", `${String(selected.expMonth).padStart(2, "0")}/${selected.expYear}`)}
                </p>
              ) : null}
            </div>
          </div>
          {editing ? (
            <form
              className="mt-6 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void updateWalletMethod({
                  data: {
                    paymentMethodId: selected.id,
                    nickname,
                    expMonth: Number(expMonth) || undefined,
                    expYear: Number(expYear) || undefined,
                  },
                })
                  .then(async (res) => {
                    if (!res.ok) {
                      toast.error(t("actionFailed"));
                      return;
                    }
                    toast.success(t("walletSaved"));
                    setEditing(false);
                    await refresh();
                    setScreen("list");
                  })
                  .catch(() => toast.error(t("actionFailed")))
                  .finally(() => setBusy(false));
              }}
            >
              <label className="block text-sm font-medium" htmlFor="wallet-nickname">
                {t("walletNickname")}
              </label>
              <input
                id="wallet-nickname"
                value={nickname}
                maxLength={40}
                onChange={(event) => setNickname(event.target.value)}
                className="ke-input min-h-11 w-full"
              />
              {selected.kind !== "acss_debit" ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    {t("walletMonth")}
                    <input
                      inputMode="numeric"
                      value={expMonth}
                      onChange={(event) => setExpMonth(event.target.value)}
                      className="ke-input mt-1 min-h-11 w-full"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    {t("walletYear")}
                    <input
                      inputMode="numeric"
                      value={expYear}
                      onChange={(event) => setExpYear(event.target.value)}
                      className="ke-input mt-1 min-h-11 w-full"
                    />
                  </label>
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy}>
                {t("walletSave")}
              </Button>
            </form>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setEditing(true)}>
                {t("walletEdit")}
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={busy || selected.isDefault}
                data-ke="wallet-default"
                onClick={() => {
                  setBusy(true);
                  void updateWalletMethod({ data: { paymentMethodId: selected.id, makeDefault: true } })
                    .then(async (res) => {
                      if (!res.ok) {
                        toast.error(t("actionFailed"));
                        return;
                      }
                      toast.success(t("walletSaved"));
                      await refresh();
                      setScreen("list");
                    })
                    .catch(() => toast.error(t("actionFailed")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("walletSetDefault")}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={busy}
                data-ke="wallet-remove"
                onClick={() => {
                  setBusy(true);
                  void removeWalletMethod({ data: selected.id })
                    .then(async (res) => {
                      if (!res.ok) {
                        toast.error(t("actionFailed"));
                        return;
                      }
                      toast.success(t("walletRemoved"));
                      await refresh();
                      setScreen("list");
                    })
                    .catch(() => toast.error(t("actionFailed")))
                    .finally(() => setBusy(false));
                }}
              >
                {t("walletRemove")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

type MountedStripe = HTMLElement & {
  __stripeElements?: {
    create: (type: "payment", options?: Record<string, unknown>) => { mount: (el: HTMLElement) => void; unmount: () => void };
    submit: () => Promise<{ error?: { message?: string } }>;
  };
  __stripe?: {
    confirmSetup: (options: {
      elements: NonNullable<MountedStripe["__stripeElements"]>;
      redirect: "if_required";
      confirmParams?: { return_url?: string };
    }) => Promise<{ error?: { message?: string } }>;
  };
};

function AddMethod({ state, onDone }: { state: ConnectPublicState; onDone: () => void }) {
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mountId] = useState(() => "wallet-payment-element");

  useEffect(() => {
    const key = state.publishableKey;
    if (!key) return;
    let dead = false;
    let unmount: (() => void) | null = null;
    void (async () => {
      const setup = await createWalletSetup();
      if (!setup.ok || !setup.clientSecret || dead) {
        if (!dead) setError(t("walletNotSetUp"));
        return;
      }
      const stripe = await loadStripeClient(key);
      if (!stripe || dead) return;
      const elements = stripe.elements({
        clientSecret: setup.clientSecret,
        appearance: { variables: { colorPrimary: "#1a3790" } },
      });
      const node = document.getElementById(mountId) as MountedStripe | null;
      if (!node || dead) return;
      const payment = elements.create("payment", paymentElementOptions());
      payment.mount(node);
      node.dataset.apple = state.appleMerchantId ? "1" : "0";
      node.dataset.google = state.googlePayMerchantId ? "1" : "0";
      unmount = () => payment.unmount();
      node.dataset.ready = "1";
      node.__stripeElements = elements;
      node.__stripe = stripe;
    })().catch(() => {
      if (!dead) setError(t("actionFailed"));
    });
    return () => {
      dead = true;
      unmount?.();
    };
  }, [mountId, state.appleMerchantId, state.googlePayMerchantId, state.publishableKey, t]);

  return (
    <form
      className="mt-2 space-y-4"
      data-ke="wallet-add-form"
      onSubmit={(event) => {
        event.preventDefault();
        const node = document.getElementById(mountId) as MountedStripe | null;
        const elements = node?.__stripeElements;
        const stripe = node?.__stripe;
        if (!elements || !stripe) {
          setError(t("actionFailed"));
          return;
        }
        setBusy(true);
        setError(null);
        void elements
          .submit()
          .then(async (submitted) => {
            if (submitted.error) throw new Error(submitted.error.message || t("actionFailed"));
            const result = await stripe.confirmSetup({
              elements,
              redirect: "if_required",
              confirmParams: { return_url: `${window.location.origin}/account?section=wallet` },
            });
            if (result.error) throw new Error(result.error.message || t("actionFailed"));
            toast.success(t("walletSaved"));
            onDone();
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : t("actionFailed")))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-sm leading-6 text-muted">{t("walletAddBody")}</p>
      <div id={mountId} className="min-h-24" data-ke="wallet-element" />
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {t("walletSave")}
      </Button>
    </form>
  );
}
