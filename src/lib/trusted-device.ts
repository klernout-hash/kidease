export function deviceLabelFromUserAgent(userAgent?: string | null): string {
  const ua = String(userAgent || "");
  if (!ua.trim()) return "This browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua) && !/Edg\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua) && !/Chrome\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export function formatDeviceTime(iso?: string | null): string {
  if (!iso) return "Unknown";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Unknown";
  return at.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
