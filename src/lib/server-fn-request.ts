/** A browser or crawler opened /_serverFn/ without the TanStack call header. */
export function bareServerFnRequest(pathname: string, serverFnHeader: string | null): boolean {
  if (!pathname.includes("/_serverFn/")) return false;
  return serverFnHeader !== "true";
}
