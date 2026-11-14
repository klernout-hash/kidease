/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { SearchCardOrigin as CardOrigin } from "@/lib/search-card-origin";

const SearchCardAges = createContext<string[]>([]);
const SearchCardOrigin = createContext<CardOrigin | null>(null);

export function SearchCardOriginProvider({ value, children }: { value: CardOrigin | null; children: ReactNode }) {
  return <SearchCardOrigin.Provider value={value}>{children}</SearchCardOrigin.Provider>;
}

export function useSearchCardOrigin(): CardOrigin | null {
  return useContext(SearchCardOrigin);
}

export function SearchCardAgesProvider({ ages, children }: { ages: string[]; children: ReactNode }) {
  return <SearchCardAges.Provider value={ages}>{children}</SearchCardAges.Provider>;
}

export function useSearchCardAges(): string[] {
  return useContext(SearchCardAges);
}
