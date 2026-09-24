import { useEffect, useRef } from "react";

/** Invalidates an in-flight submit when the sheet closes or unmounts. */
export function useLiveSubmit(active: boolean) {
  const gen = useRef(0);
  useEffect(() => {
    if (!active) gen.current += 1;
    return () => {
      gen.current += 1;
    };
  }, [active]);
  return {
    start() {
      gen.current += 1;
      return gen.current;
    },
    live(token: number) {
      return token === gen.current;
    },
  };
}
