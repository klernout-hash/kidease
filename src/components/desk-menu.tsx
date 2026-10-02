import { createContext, useContext, type ReactNode } from "react";
import type { DeskId, DeskItem } from "@/lib/desk-nav";

export type DeskMenuState = {
  desk: DeskId;
  items: DeskItem[];
  active: string;
  pathname: string;
  onSelect: (id: string) => void;
};

const DeskMenuContext = createContext<DeskMenuState | null>(null);

export function DeskMenuProvider({ value, children }: { value: DeskMenuState; children: ReactNode }) {
  return <DeskMenuContext.Provider value={value}>{children}</DeskMenuContext.Provider>;
}

export function useDeskMenu() {
  return useContext(DeskMenuContext);
}
