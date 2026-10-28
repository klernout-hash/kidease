/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";

const SearchCardAges = createContext<string[]>([]);

export function SearchCardAgesProvider({ ages, children }: { ages: string[]; children: ReactNode }) {
  return <SearchCardAges.Provider value={ages}>{children}</SearchCardAges.Provider>;
}

export function useSearchCardAges(): string[] {
  return useContext(SearchCardAges);
}
