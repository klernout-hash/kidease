import { Toaster } from "sonner";
import { useAppStore } from "@/lib/store";

export function KidEaseToaster() {
  const theme = useAppStore((s) => s.resolvedTheme);
  return (
    <Toaster
      theme={theme}
      position="top-center"
      richColors={false}
      className="z-[100]"
      style={{ pointerEvents: "none", zIndex: 100 }}
      toastOptions={{ style: { pointerEvents: "auto" } }}
    />
  );
}
