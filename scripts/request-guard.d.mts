export const CANONICAL_ORIGIN: string;
export const CHANGE_PASSWORD_PATH: string;
export const CHANGE_PASSWORD_DESTINATION: string;
export function hostnameOf(hostHeader: string | null | undefined): string;
export function isVercelAppHost(hostHeader: string | null | undefined): boolean;
export function normalizePath(pathname: string | null | undefined): string;
export function isSensitiveDeskPath(pathname: string | null | undefined): boolean;
export function decideRequest(input?: {
  host?: string | null;
  pathname?: string | null;
  search?: string | null;
}):
  | { action: "next" }
  | { action: "redirect"; status: 302; location: string };
