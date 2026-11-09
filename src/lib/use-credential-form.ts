import { useEffect, useState } from "react";

/** False on the server and on the first paint. True only after hydration. */
export function useCredentialFormReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}
