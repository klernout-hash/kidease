/**
 * Amazon Appstore package link. Off unless FEATURE_AMAZON_STORE_DEEP_LINK is on.
 * A verified https listing from NEXT_PUBLIC_AMAZON_APPSTORE_URL always wins.
 * Amazon Device Messaging stays on FEATURE_AMAZON_ADM and is not changed here.
 *
 * No @/ imports. scripts/amazon-platform.test.mjs loads this file in Node.
 */

import { amazonAppstoreDeepLink } from "../amazon-appstore.ts";
import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";
import { STORE } from "../store-listing.ts";

export const AMAZON_DEEP_LINK_FLAG = "FEATURE_AMAZON_STORE_DEEP_LINK";

export const AMAZON_PACKAGE_HTTPS = `https://www.amazon.com/gp/mas/dl/android?p=${STORE.playPackageName}`;

export type AmazonPlatformMarks = {
  amazonDeepLink?: true;
};

export function amazonPlatformContext(env?: EnvMap): AmazonPlatformMarks {
  if (!evaluateFeatureFlag(AMAZON_DEEP_LINK_FLAG, env)) return {};
  return { amazonDeepLink: true };
}

/**
 * Listing href for Get the app.
 * A real env URL is returned either way. The package page is used only when
 * the flag is on and the env URL is empty.
 */
export function amazonListingHref(flagOn: boolean, envUrl: string | null): string | null {
  if (envUrl) return envUrl;
  if (!flagOn) return null;
  return AMAZON_PACKAGE_HTTPS;
}

export function amazonPackageDeepLink(flagOn: boolean): string | null {
  if (!flagOn) return null;
  return amazonAppstoreDeepLink();
}
