import { createFileRoute } from "@tanstack/react-router";
import { KioskPage } from "@/routes/kiosk";
import { getFireKioskAccess } from "@/lib/server/fire-kiosk";

export const Route = createFileRoute("/fr/kiosk")({
  validateSearch: (s: Record<string, unknown>) => ({ preview: s.preview ? String(s.preview) : undefined }),
  loader: () => getFireKioskAccess().catch(() => ({ allowed: true, nativeFire: false })),
  head: () => ({ meta: [{ title: "Écran d'arrivée · KidEase" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FrKioskRoute,
});

function FrKioskRoute() {
  const access = Route.useLoaderData();
  const { preview } = Route.useSearch();
  return <KioskPage access={access} preview={preview} />;
}

