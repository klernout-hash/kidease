import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getUiChrome } from "@/lib/server/ui-chrome";
import { useSessionDesks } from "@/components/session-desks";

type PayChromeState = {
  showPayCtas: boolean;
  ready: boolean;
};

const PayChromeContext = createContext<PayChromeState>({ showPayCtas: false, ready: false });

/**
 * One SHOW_PAY_CTAS read for public + signed-in chrome.
 * Defaults off so Upgrade / Subscribe never flash on.
 */
export function PayChromeProvider({ children }: { children: ReactNode }) {
  const { session, ready: desksReady } = useSessionDesks();
  const [publicOn, setPublicOn] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!desksReady) return;
    if (session) {
      setFetched(true);
      return;
    }
    let cancelled = false;
    void getUiChrome()
      .then((chrome) => {
        if (!cancelled) {
          setPublicOn(Boolean(chrome.showPayCtas));
          setFetched(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [desksReady, session]);

  const showPayCtas = session ? Boolean(session.showPayCtas) : publicOn;
  return (
    <PayChromeContext.Provider value={{ showPayCtas, ready: desksReady && fetched }}>
      {children}
    </PayChromeContext.Provider>
  );
}

export function useShowPayCtas(): boolean {
  return useContext(PayChromeContext).showPayCtas;
}

export function usePayChromeReady(): boolean {
  return useContext(PayChromeContext).ready;
}

/** Hide Upgrade / Subscribe / plan-price chrome when SHOW_PAY_CTAS is off. */
export function PayCtas({ children }: { children: ReactNode }) {
  const on = useShowPayCtas();
  if (!on) return null;
  return <>{children}</>;
}
