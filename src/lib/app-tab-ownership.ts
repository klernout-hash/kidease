/** Coordinate overlapping Shells without leaving the successor unowned. */
export function createAppTabOwnership() {
  const mounted = new Set<symbol>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    isPrimary(token: symbol): boolean {
      const first = mounted.values().next();
      return first.done || first.value === token;
    },
    mount(token: symbol) {
      mounted.add(token);
      notify();
      return () => {
        if (mounted.delete(token)) notify();
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
