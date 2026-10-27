import { useEffect, useState } from "react";

/** True after the first client effect. Keeps skeletons out of the server HTML. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
