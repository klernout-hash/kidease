export const PLACEHOLDER_APPLE_TEAM_ID: string;
export const AASA_PATH: string;
export const AASA_JSON_PATH: string;
export const AASA_ROOT_PATH: string;
export const ASSETLINKS_PATH: string;
export const WELL_KNOWN_APP_LINK_PATHS: string[];
export function normalizeWellKnownPath(pathname: string | null | undefined): string;
export function isWellKnownAppLinksPath(pathname: string | null | undefined): boolean;
export function wellKnownAppLinksPayload(
  pathname: string,
  env?: NodeJS.ProcessEnv,
): { path: string; body: string; contentType: string } | null;
export function wellKnownStaticPayload(
  pathname: string,
  env?: NodeJS.ProcessEnv,
): { path: string; body: string; contentType: string } | null;
export function wellKnownAppLinksHeaders(contentType?: string): Record<string, string>;
