import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LocalePathBoot } from "@/components/locale-path-boot";

export const Route = createFileRoute("/fr")({
  component: FrLayout,
});

function FrLayout() {
  return (
    <>
      <LocalePathBoot locale="fr" />
      <Outlet />
    </>
  );
}
