import { useLayoutEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import {
  readClientStoreChannel,
  shellBlocksCommerce,
  type StoreChannel,
} from "@/lib/native-entitlements";

/**
 * True when this shell must hide KidEase prices and Stripe.
 * Apple, Google Play, and Huawei. Samsung and the Microsoft Store PWA stay false.
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
