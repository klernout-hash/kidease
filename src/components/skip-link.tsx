import { skipLinkLabel } from "@/lib/a11y-pass";
import { useCopy } from "@/lib/use-copy";

/**
 * Web only. The native shells have no page header to skip, and Android
 * TalkBack read the hidden link as the first item (N-71). The server leaves it
 * out for a known native shell; the CSS rule covers a shell found after boot.
 */
export function SkipLink({ enabled }: { enabled: boolean }) {
  const { locale } = useCopy();
  if (!enabled) return null;
  return (
    <a
      href="#main-content"
      data-ke="skip-link"
      className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-primary focus:px-4 focus:text-primary-fg"
    >
      {skipLinkLabel(locale)}
    </a>
  );
}
