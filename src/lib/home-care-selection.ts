import type { BrowseDaycareType } from "@/components/facility-type-rails";

type Listener = (type: BrowseDaycareType | undefined) => void;

let current: BrowseDaycareType | undefined;
const listeners = new Set<Listener>();

export function getHomeCareType() {
  return current;
}

export function setHomeCareType(type: BrowseDaycareType | undefined) {
  current = type;
  for (const listener of listeners) listener(type);
}

export function subscribeHomeCareType(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
