/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { SearchCardOrigin as CardOrigin } from "@/lib/search-card-origin";

const SearchCardAges = createContext<string[]>([]);
const SearchCardOrigin = createContext<CardOrigin | null>(null);
type CardWork = { lat: number; lng: number; label?: string };
/** The work place this search really uses. Null = no commute pill (a stale saved anchor never counts). */
const SearchCardWork = createContext<CardWork | null>(null);

export function SearchCardWorkProvider({ value, children }: { value: CardWork | null; children: ReactNode }) {
  return <SearchCardWork.Provider value={value}>{children}</SearchCardWork.Provider>;
}

export function useSearchCardWork(): CardWork | null {
  return useContext(SearchCardWork);
}

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
