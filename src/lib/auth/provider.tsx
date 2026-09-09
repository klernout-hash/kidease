import type { ReactNode } from "react";
import { SessionDesksProvider } from "@/components/session-desks";
import { PayChromeProvider } from "@/components/pay-chrome";

/**
 * App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
 *
 *   <AuthProvider><Outlet /></AuthProvider>
 *
 * Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
 * its `useSession()` works standalone. SessionDesksProvider shares one
 * getMyDesks result so desk pages do not each re-fetch.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionDesksProvider>
      <PayChromeProvider>{children}</PayChromeProvider>
    </SessionDesksProvider>
  );
}
