import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rateKidEaseFromMenu } from "@/lib/store-review";
import { useCopy } from "@/lib/use-copy";

async function runRate(onGetApp: () => void): Promise<void> {
  const result = await rateKidEaseFromMenu();
  if (result === "get-app") onGetApp();
}

export function RateKidEaseMenuRow() {
  const { t } = useCopy();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-1 text-left text-[15px] text-fg last:border-b-0"
      onClick={() => void runRate(() => void navigate({ to: "/get-app", search: { dev: undefined } }))}
    >
      {t("rateKidEase")}
      <ChevronRight className="size-4 text-muted" />
    </button>
  );
}

export function RateKidEaseButton({ className }: { className?: string }) {
  const { t } = useCopy();
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      onClick={() => void runRate(() => void navigate({ to: "/get-app", search: { dev: undefined } }))}
    >
      {t("rateKidEase")}
    </Button>
  );
}
