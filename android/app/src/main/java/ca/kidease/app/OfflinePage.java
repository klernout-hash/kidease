package ca.kidease.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Bundled EN/FR offline page. Saved centres come from Capacitor Preferences. */
public final class OfflinePage {
    private static final String TAG = "KidEase";
    static final String PREF_FILE = "CapacitorStorage";
    static final String PREF_KEY = "ke-offline-shortlist";
    private static boolean showing;

    private OfflinePage() {}

    static boolean isShowing() {
        return showing;
    }

    static void reset() {
        showing = false;
    }

    static void show(Context context, WebView webView) {
        if (context == null || webView == null || showing) return;
        String url = webView.getUrl();
        if (url != null && url.contains("ke-offline-page")) return;
        showing = true;
        try {
            String html = readAsset(context, "offline/index.html");
            webView.loadDataWithBaseURL("https://localhost/ke-offline-page/", html, "text/html", "utf-8", null);
            webView.postDelayed(() -> injectSaved(context, webView), 400);
        } catch (IOException ex) {
            showing = false;
            Log.e(TAG, "Offline page missing", ex);
        }
    }

    static void injectSaved(Context context, WebView webView) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE);
        String raw = prefs.getString(PREF_KEY, "[]");
        if (raw == null || raw.isEmpty()) raw = "[]";
        String js = "window.keRenderSaved && window.keRenderSaved(" + jsonLiteral(raw) + ")";
        webView.evaluateJavascript(js, null);
    }

    static String jsonLiteral(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (!value.startsWith("[") || !value.endsWith("]")) return "[]";
        if (value.indexOf('<') >= 0 || value.indexOf('\u2028') >= 0 || value.indexOf('\u2029') >= 0) return "[]";
        return value;
    }

    private static String readAsset(Context context, String name) throws IOException {
        try (InputStream in = context.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8);
        }
    }
}
