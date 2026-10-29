package ca.kidease.app;

import android.net.Uri;

/**
 * Keep in step with isAccessProtectedPath in src/lib/native-admin.ts.
 * Admin and Cloudflare Access stay inside the app, on /app-admin-unavailable.
 * /use-the-website stays open for binaries that already point there.
 */
public final class AdminWebOnly {
    public static final String NOTE_PATH = "/app-admin-unavailable";
    public static final String LEGACY_NOTE_PATH = "/use-the-website";

    private AdminWebOnly() {}

    public static boolean isBlocked(Uri url) {
        if (url == null) return false;
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase();
        if (isAccessHost(host)) return true;
        if (!host.isEmpty() && !isKidEaseHost(host)) return false;
        String path = url.getPath();
        if (path == null || path.isEmpty()) return false;
        if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        if ("/fr".equals(path)) path = "/";
        if (path.startsWith("/fr/")) path = path.substring(3);
        if (path.isEmpty()) path = "/";
        if (NOTE_PATH.equals(path) || LEGACY_NOTE_PATH.equals(path)) return false;
        return "/admin".equals(path)
            || path.startsWith("/admin/")
            || path.startsWith("/admin-")
            || "/api/admin".equals(path)
            || path.startsWith("/api/admin/");
    }

    public static boolean isAccessHost(String host) {
        if (host == null) return false;
        String value = host.toLowerCase();
        return "cloudflareaccess.com".equals(value) || value.endsWith(".cloudflareaccess.com");
    }

    static boolean isKidEaseHost(String host) {
        String value = host == null ? "" : host.toLowerCase();
        return "kidease.ca".equals(value) || "www.kidease.ca".equals(value) || value.endsWith(".kidease.ca");
    }

    public static String noteUrl(Uri from) {
        String scheme = from != null && "http".equals(from.getScheme()) ? "http" : "https";
        String host = "www.kidease.ca";
        if (from != null && from.getHost() != null && isKidEaseHost(from.getHost())) host = from.getHost();
        return scheme + "://" + host + NOTE_PATH;
    }
}
