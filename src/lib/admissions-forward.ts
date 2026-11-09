/** Where /admissions should go. There is no admissions page and no queue number. */

export function admissionsRedirectPath(input: {
  pathname: string;
  role: string | null;
  signedIn: boolean;
}): string | null {
  const path = input.pathname.replace(/\/+$/, "") || "/";
  const french = path === "/fr/admissions";
  if (path !== "/admissions" && !french) return null;
  if (input.role === "provider") {
    return french ? "/fr/provider?desk=requests" : "/provider?desk=requests";
  }
  if (input.signedIn) {
    return french ? "/fr/parent?tab=waitlists" : "/parent?tab=waitlists";
  }
  const next = encodeURIComponent(french ? "/fr/admissions" : "/admissions");
  return french ? `/fr/login?intent=in&next=${next}` : `/login?intent=in&next=${next}`;
}
