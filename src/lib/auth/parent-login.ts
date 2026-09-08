/** Parent sign-in that returns the visitor to the page they were on. */
export function parentLoginSearch(next: string) {
  const dest = next.startsWith("/") ? next : `/${next}`;
  return {
    role: "parent" as const,
    desk: "parent" as const,
    intent: "in" as const,
    next: dest,
  };
}
