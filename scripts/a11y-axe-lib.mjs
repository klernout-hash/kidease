/** Pages the axe check opens, in English and French. */
export const AXE_PAGES = Object.freeze([
  { id: "home", path: "/" },
  { id: "home-fr", path: "/fr" },
  { id: "login", path: "/login" },
  { id: "login-fr", path: "/fr/login" },
  { id: "signup", path: "/signup" },
  { id: "signup-fr", path: "/fr/signup" },
  { id: "account", path: "/account" },
  { id: "account-fr", path: "/fr/account" },
  { id: "provider", path: "/provider" },
  { id: "provider-fr", path: "/fr/provider" },
  { id: "parent", path: "/parent" },
  { id: "parent-fr", path: "/fr/parent" },
]);

export const AXE_BLOCKING_IMPACTS = Object.freeze(["serious", "critical"]);

export function blockingViolations(violations) {
  return (violations || []).filter((item) => AXE_BLOCKING_IMPACTS.includes(item?.impact));
}

export function listingPathFromHref(href) {
  if (!href) return null;
  const path = href.startsWith("http") ? new URL(href).pathname : href.split(/[?#]/)[0];
  const bare = path.replace(/^\/fr(?=\/)/, "");
  if (!bare.startsWith("/daycare/") || bare.startsWith("/daycare/city")) return null;
  return path;
}
