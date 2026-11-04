import { useEffect } from "react";
import { toast, Toaster } from "sonner";
import { attachSuccessToastBridge } from "@/lib/success-confirm";
import { useAppStore } from "@/lib/store";

export function KidEaseToaster() {
  const theme = useAppStore((s) => s.resolvedTheme);
  useEffect(() => {
    attachSuccessToastBridge(
      toast as unknown as { success: (message?: unknown, data?: unknown) => unknown },
    );
  }, []);
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
