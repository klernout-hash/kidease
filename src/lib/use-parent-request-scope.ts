import { useCallback, useEffect, useRef } from "react";

/** A result belongs to one mounted viewer and one request in its channel. */
export function useParentRequestScope(viewerId: string | undefined) {
  const viewer = useRef({ id: viewerId, generation: 0 });
  const mounted = useRef(true);
  const channels = useRef(new Map<string, number>());
  if (viewer.current.id !== viewerId) {
    viewer.current = { id: viewerId, generation: viewer.current.generation + 1 };
  }
  useEffect(() => {
    const requests = channels.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      viewer.current = { ...viewer.current, generation: viewer.current.generation + 1 };
      requests.clear();
    };
  }, []);
  const issue = useCallback((channel: string) => {
    const owner = viewer.current;
    const sequence = (channels.current.get(channel) ?? 0) + 1;
    channels.current.set(channel, sequence);
    let cancelled = false;
    return {
      viewerId: owner.id,
      isCurrent: () =>
        !cancelled &&
        mounted.current &&
        owner === viewer.current &&
        channels.current.get(channel) === sequence,
      cancel: () => {
        cancelled = true;
      },
    };
  }, []);
  return { issue, generation: viewer.current.generation };
}
