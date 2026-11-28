import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSessionDesks } from "@/components/session-desks";
import { canVisitDesk } from "@/lib/desks";
import { openNativeAdminBrowser } from "@/lib/native-admin";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";

export function NativeAdminLaunchButton() {
  const { locale, t } = useCopy();
  return (
    <Button
      type="button"
      variant="secondary"
      data-ke="native-admin-open"
      onClick={() => {
        void openNativeAdminBrowser(locale).catch(() =>
          toast.error(locale === "fr" ? "Impossible d’ouvrir l’administration. Réessayez." : "Admin could not open. Try again."),
        );
      }}
    >
      {t("switchToAdmin")}
    </Button>
  );
}

export function MenuDeskTools() {
  const { session } = useSessionDesks();
  const native = useNativeHidesAdmin();
  if (!native || !session?.email || !canVisitDesk(session.desks, "admin", session.role, session.email)) return null;
  return (
    <div className="ke-gutter mx-auto mt-4 w-full max-w-lg">
      <NativeAdminLaunchButton />
    </div>
  );
}
