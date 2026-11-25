import { createFileRoute } from "@tanstack/react-router";
import { LogoutScreen, logoutBeforeLoad, logoutHead } from "@/routes/logout";

export const Route = createFileRoute("/fr/logout")({
  beforeLoad: logoutBeforeLoad,
  head: () => logoutHead("Déconnexion · KidEase"),
  component: FrLogout,
});

function FrLogout() {
  return <LogoutScreen locale="fr" />;
}
