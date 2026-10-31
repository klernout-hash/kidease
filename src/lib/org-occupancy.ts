/**
 * Occupancy from licensed capacity and enrolled bookings.
 * A missing number stays missing. KidEase does not invent occupancy.
 */

export type SiteFacts = {
  id: string;
  name: string;
  city: string;
  province: string;
  licensedCapacity: number | null;
  enrolled: number | null;
  openSpots: number | null;
};

export type OccupancyNote = "ready" | "capacity-missing" | "enrolment-missing";

export type SiteOccupancy = SiteFacts & {
  occupancyPercent: number | null;
  note: OccupancyNote;
};

function whole(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export function siteOccupancy(site: SiteFacts): SiteOccupancy {
  const licensedCapacity = whole(site.licensedCapacity);
  const capacity = licensedCapacity != null && licensedCapacity > 0 ? licensedCapacity : null;
  const enrolled = whole(site.enrolled);
  const openSpots = whole(site.openSpots);
  const base = { ...site, licensedCapacity: capacity, enrolled, openSpots };
  if (capacity == null) return { ...base, occupancyPercent: null, note: "capacity-missing" };
  if (enrolled == null) return { ...base, occupancyPercent: null, note: "enrolment-missing" };
  const filled = Math.min(enrolled, capacity);
  return {
    ...base,
    occupancyPercent: Math.round((filled / capacity) * 1000) / 10,
    note: "ready",
  };
}

export function orgTotals(sites: readonly SiteOccupancy[]): {
  sites: number;
  ready: number;
  capacity: number | null;
  enrolled: number | null;
  occupancyPercent: number | null;
} {
  const ready = sites.filter((site) => site.note === "ready" && site.licensedCapacity && site.enrolled != null);
  if (!ready.length) return { sites: sites.length, ready: 0, capacity: null, enrolled: null, occupancyPercent: null };
  const capacity = ready.reduce((sum, site) => sum + (site.licensedCapacity || 0), 0);
  const enrolled = ready.reduce((sum, site) => sum + (site.enrolled || 0), 0);
  const filled = Math.min(enrolled, capacity);
  return {
    sites: sites.length,
    ready: ready.length,
    capacity,
    enrolled,
    occupancyPercent: capacity ? Math.round((filled / capacity) * 1000) / 10 : null,
  };
}
