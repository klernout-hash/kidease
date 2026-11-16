import { useRouterState } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";

/**
 * Microsoft Store link. Renders nothing until FEATURE_MS_STORE_LINK is on
 * and MICROSOFT_STORE_PRODUCT_ID is a real product id. No invented URL.
 */
export function MicrosoftStoreLink() {
  const url = useRouterState({
    select: (state) => {
      for (const match of state.matches) {
        const href = (match.context as { msStoreUrl?: string }).msStoreUrl;
        if (href) return href;
      }
      return "";
    },
  });
  const { t } = useCopy();
  if (!url) return null;
  return (
    <p className="mt-3">
      <a
        href={url}
        className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
        rel="noopener noreferrer"
        data-ke="microsoft-store"
      >
        {t("storeMicrosoftName")}
      </a>
    </p>
  );
}
