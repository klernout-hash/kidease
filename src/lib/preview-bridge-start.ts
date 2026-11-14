import { resolveParentEmbedderOrigin } from "./preview-embedder-origin.ts";
import type { PreviewHostBridgeOptions } from "./preview-host-bridge.ts";

type BridgeModule = {
  installPreviewHostBridge: (options?: PreviewHostBridgeOptions) => () => void;
  collectRoutePathsFromTree: (tree: unknown) => string[];
};

/** The existing origin policy is cheap and does not import schema code. */
export function previewBridgeParentOrigin(): string | null {
  if (typeof window === "undefined") return null;
  const ancestorOrigin =
    typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0
      ? location.ancestorOrigins[0]
      : null;
  return resolveParentEmbedderOrigin(
    window.parent === window,
    document.referrer,
    ancestorOrigin,
    window.location.hostname,
  );
}

/** Install only inside an eligible frame; teardown also cancels an arriving chunk. */
export function startPreviewHostBridge(
  options: { navigate: (path: string) => void; routeTree: unknown },
  dependencies: {
    eligible?: () => boolean;
    load?: () => Promise<BridgeModule>;
    onError?: (error: unknown) => void;
  } = {},
): () => void {
  if (!(dependencies.eligible ?? (() => previewBridgeParentOrigin() !== null))()) return () => {};
  let stopped = false;
  let dispose: (() => void) | undefined;
  const load = dependencies.load ?? (() => import("./preview-host-bridge.ts"));
  void load()
    .then((bridge) => {
      if (stopped) return;
      dispose = bridge.installPreviewHostBridge({
        navigate: options.navigate,
        getRoutePaths: () => bridge.collectRoutePathsFromTree(options.routeTree),
      });
    })
    .catch((error: unknown) => {
      if (stopped) return;
      if (dependencies.onError) dependencies.onError(error);
      else console.warn("[kidease] Preview navigation bridge did not start");
    });
  return () => {
    stopped = true;
    dispose?.();
    dispose = undefined;
  };
}
