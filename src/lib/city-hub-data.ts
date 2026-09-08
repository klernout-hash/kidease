import generatedHubs from "@/lib/data/city-hubs.json";
import { cityHubDefBySlug, type CityHubSnapshot } from "@/lib/city-hubs";

const hubs = (Array.isArray(generatedHubs) ? generatedHubs : []) as CityHubSnapshot[];

export function cityHubs(): CityHubSnapshot[] {
  return hubs.filter((hub) => hub.count > 0 && hub.listings.length > 0);
}

export function cityHubBySlug(slug: string | null | undefined): CityHubSnapshot | null {
  const def = cityHubDefBySlug(slug);
  if (!def) return null;
  return hubs.find((hub) => hub.slug === def.slug && hub.count > 0) ?? null;
}
