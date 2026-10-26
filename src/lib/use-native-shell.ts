import { useLayoutEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import {
  readClientStoreChannel,
  shellBlocksCommerce,
  type StoreChannel,
} from "@/lib/native-entitlements";

/**
 * True when this shell must hide KidEase prices and Stripe.
 * Every store app is off in v1. A normal browser stays false.
 */
export function useInNativeShell(): boolean {
  const nativeShell = useRouteContext({
    from: "__root__",
    select: (ctx) => Boolean(ctx.nativeShell),
  });
  const [blocked, setBlocked] = useState(nativeShell);
  useLayoutEffect(() => {
    setBlocked(shellBlocksCommerce(readClientStoreChannel()));
  }, []);
  return blocked;
}

export function useStoreChannel(): StoreChannel {
  const initial = useRouteContext({
    from: "__root__",
    select: (ctx) => (ctx.storeChannel ?? "web") as StoreChannel,
  });
  const [channel, setChannel] = useState<StoreChannel>(initial);
  useLayoutEffect(() => {
    setChannel(readClientStoreChannel());
  }, []);
  return channel;
}

/** Hide plan prices in every store shell, including the Microsoft `ke_store` cookie. */
export function useStoreShell(): boolean {
  const nativeShell = useInNativeShell();
  const channel = useStoreChannel();
  return nativeShell || shellBlocksCommerce(channel);
}
