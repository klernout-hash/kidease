import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import {
  detectBrowserWallets,
  visibleWalletLabels,
  type WalletAvailability,
} from "@/lib/wallets";

export function WalletMethodHints({
  stripeLive,
  className,
}: {
  stripeLive: boolean;
  className?: string;
}) {
  const { t } = useCopy();
  const [wallets, setWallets] = useState<WalletAvailability | null>(null);

  useEffect(() => {
    setWallets(detectBrowserWallets());
  }, []);

  if (!stripeLive) {
    return <p className={cn("text-xs text-subtle", className)}>{t("payWalletsOff")}</p>;
  }

  if (!wallets) return null;

  if (wallets.nativeWebView) {
    return (
      <div className={cn("space-y-1 text-center", className)}>
        <p className="text-xs text-subtle">{t("payCadNote")}</p>
        <p className="text-xs text-subtle">{t("payWalletsNative")}</p>
      </div>
    );
  }

  const labels = visibleWalletLabels(wallets);
  const hasWallet = wallets.applePay || wallets.googlePay;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap justify-center gap-1.5">
        {labels.map((key) => (
          <span
            key={key}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-border"
          >
            {t(key)}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-subtle">{t("payCadNote")}</p>
      <p className="text-center text-xs text-subtle">
        {hasWallet ? t("payWalletsHint") : t("payWalletsUnavailable")}
      </p>
    </div>
  );
}
