/**
 * Banner-only “preview as parent/provider”. The agent stays themselves.
 * TODO: read-only impersonation is unsafe until we can scope writes per desk.
 */

export function SupportPreviewBanner() {
  return (
    <div className="border-b border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Support preview scaffold</p>
      <p className="mt-1 text-amber-900/80">
        You are still signed in as yourself. This is not impersonation — writes here would
        hit your own parent or provider records. Use the case 360 panels for the other
        person’s data.
      </p>
    </div>
  );
}
