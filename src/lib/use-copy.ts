import { tx, type CopyKey } from "./copy";
import { useAppStore } from "./store";

export function useCopy() {
  const locale = useAppStore((s) => s.locale);
  return {
    locale,
    t: (key: CopyKey) => tx(locale, key),
  };
}
