import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ShellLite } from "@/components/shell-lite";
import { BrandMark } from "@/components/brand-mark";
import { signOut } from "@/lib/auth/client";
import { endSessionForLogout } from "@/lib/server/logout";
import { useCopy } from "@/lib/use-copy";
import { signedOutLoginPath } from "@/lib/sign-out-target";

/**
 * `/logout` and `/fr/logout` (B1). The server ends this browser's session in
 * `beforeLoad`, so a visit without JavaScript also signs out. The page then
 * runs the same client sign-out as the button on /account and lands on the
 * sign-in page in the same language (N-37).
 */
export async function logoutBeforeLoad(): Promise<void> {
  try {
    await endSessionForLogout();
  } catch {
    /* the client sign-out below still runs */
  }
}

export const logoutHead = (title: string) => ({
  meta: [{ title }, { name: "robots", content: "noindex, nofollow" }],
});

export const Route = createFileRoute("/logout")({
  beforeLoad: logoutBeforeLoad,
  head: () => logoutHead("Signing you out · KidEase"),
  component: LogoutPage,
});

function LogoutPage() {
  return <LogoutScreen locale="en" />;
}

export function LogoutScreen({ locale }: { locale: "en" | "fr" }) {
  const { t } = useCopy();
  const login = signedOutLoginPath(locale);
  useEffect(() => {
    void signOut(login);
  }, [login]);
  return (
    <ShellLite>
      <main className="ke-auth-viewport mx-auto grid place-items-center px-4 py-10" data-ke="logout">
        <div className="w-full max-w-md rounded-xl bg-surface p-5 text-center shadow-card ring-1 ring-border sm:p-8" aria-busy="true">
          <div className="flex justify-center">
            <BrandMark size="md" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]" role="status">
            {t("logoutSigningOut")}
          </h1>
          <p className="mt-2 text-sm text-muted">{t("logoutSigningOutHint")}</p>
          <noscript>
            <p className="mt-4">
              <a href={login} className="inline-flex min-h-11 items-center font-medium text-primary">
                KidEase
              </a>
            </p>
          </noscript>
        </div>
      </main>
    </ShellLite>
  );
}
