import { useEffect, useState } from "react";

/** True after first paint when the device uses the clean look. Server render stays false. */
export function useCleanLook(): boolean {
  const [clean, setClean] = useState(false);
  useEffect(() => {
    setClean(document.documentElement.dataset.look === "clean");
  }, []);
  return clean;
}
