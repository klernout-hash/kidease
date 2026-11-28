import { Link, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NativeAdminLaunchButton } from "@/components/menu-desk-tools";
import { canVisitDesk } from "@/lib/desks";
import { getMyDesks } from "@/lib/server/roles";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";

export async function beforeLoadNativeAdminLauncher() {
  const session = await getMyDesks().catch(() => null);
  if (!session?.email || !canVisitDesk(session.desks, "admin", session.role, session.email)) throw notFound();
}

export function AdminOnWebNote() {
  const { locale, t } = useCopy();
  const native = useNativeHidesAdmin();
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg space-y-4 py-10" data-ke="admin-on-web">
        <h1 className="font-display text-3xl">{t("deskAdmin")} · KidEase</h1>
        <p className="text-sm text-muted">
          {locale === "fr"
            ? "Ouvrez l’administration dans le navigateur de l’appli. Connectez-vous et suivez les étapes de vérification."
            : "Open Admin in the app’s browser. Sign in and follow the verification steps."}
        </p>
        {native ? <NativeAdminLaunchButton /> : <a href="/admin">{t("switchToAdmin")}</a>}
        <Link to={locale === "fr" ? "/fr" : "/"} className="inline-flex min-h-11 items-center px-3">
          {t("navHome")}
        </Link>
      </main>
    </Shell>
  );
}
