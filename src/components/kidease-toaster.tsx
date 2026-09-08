import { Toaster } from "sonner";
import { useAppStore } from "@/lib/store";

export function KidEaseToaster() {
  const theme = useAppStore((s) => s.resolvedTheme);
  return (
    <Toaster
      theme={theme}
      position="top-center"
      richColors={false}
      style={{ pointerEvents: "none" }}
      toastOptions={{ style: { pointerEvents: "auto" } }}
    />
  );
}
