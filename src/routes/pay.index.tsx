import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Shell } from "@/components/shell";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/pay/")({
  component: PayHubPage,
});

function PayHubPage() {
  const { t } = useCopy();

  return (
    <Shell>
      <main className="ke-gutter mx-auto max-w-3xl py-10">
        <h1 className="sr-only">{t("payHubTitle")}</h1>
        <EmptyState
          icon={Wallet}
          title={t("payHubTitle")}
          body={t("payHubLead")}
          action={t("payHubSignIn")}
          actionTo="/login?next=/parent?tab=payments"
          secondary={t("payHubBills")}
          secondaryTo="/parent?tab=payments"
        />
      </main>
    </Shell>
  );
}
