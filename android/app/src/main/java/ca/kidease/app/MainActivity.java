package ca.kidease.app;

import android.util.Log;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

/**
 * Play sends KidEaseNative only. Samsung also sends KidEaseStoreSamsung.
 * Huawei also sends KidEaseStoreHuawei. Amazon also sends KidEaseStoreAmazon.
 * A phone with no Google Play services also sends KidEaseNoGms so the site
 * hides Continue with Google. The token is written on the WebView
 * after the bridge starts, then the page reloads if the first request missed it.
 * A Huawei debug build crashes when its token is missing. Release builds log that error.
 * Keep userAgentForStoreBuild in step with native-entitlements.ts.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "KidEase";
    private static final String NATIVE_TOKEN = "KidEaseNative";

    @Override
    protected void load() {
        // Register before the bridge is created. Capacitor copies initial plugins in super.load().
        registerPlugin(PasskeyPlugin.class);
        super.load();
        installAdminWebOnlyClient();
        String flavor = BuildConfig.FLAVOR == null ? "" : BuildConfig.FLAVOR;
        applyStoreUserAgent(flavor);
        if (!"samsung".equals(flavor)) {
            dropSamsungStoreLink();
        }
    }

    /** Admin and Cloudflare Access never leave the WebView for the system browser. */
    private void installAdminWebOnlyClient() {
        WebView webView = webViewOrNull();
        if (webView == null || getBridge() == null) return;
        webView.setWebViewClient(new AdminWebOnlyClient(getBridge()));
    }

    private void applyStoreUserAgent(String flavor) {
        WebView webView = webViewOrNull();
        if (webView == null) {
            failStoreToken(flavor, "WebView was not ready");
            return;
        }
        String configured = BuildConfig.STORE_UA_TOKEN == null ? "" : BuildConfig.STORE_UA_TOKEN;
        String current = webView.getSettings().getUserAgentString();
        String next = userAgentWithPlayServices(
            ensureNativeToken(userAgentForStoreBuild(flavor, current, configured)),
            PlayServicesStatus.available(this)
        );
        boolean changed = current == null || !current.equals(next);
        if (changed) {
            webView.getSettings().setUserAgentString(next);
        }
        enableWebAuthn(webView);
        String applied = webView.getSettings().getUserAgentString();
        if (!configured.isEmpty() && (applied == null || !applied.contains(configured))) {
            failStoreToken(flavor, "User-Agent is missing " + configured);
            return;
        }
        if (applied == null || !applied.contains(NATIVE_TOKEN)) {
            failStoreToken(flavor, "User-Agent is missing " + NATIVE_TOKEN);
            return;
        }
        if (changed) {
            webView.reload();
        }
    }

    /** Play, Samsung, Huawei, and Amazon must send KidEaseNative so the site can tell a shell from the website. */
    static String ensureNativeToken(String agent) {
        String next = agent == null ? "" : agent.trim();
        if (next.contains(NATIVE_TOKEN)) return next;
        if (next.isEmpty()) return NATIVE_TOKEN;
        return next + " " + NATIVE_TOKEN;
    }

    private void dropSamsungStoreLink() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String url = getBridge().getServerUrl();
        String cleaned = withoutSamsungStoreQuery(url);
        if (url != null && !cleaned.equals(url)) {
            getBridge().getWebView().loadUrl(cleaned);
        }
    }

    /**
     * Android System WebView can run WebAuthn as the app (asset-links origin)
     * from androidx.webkit 1.12. Older WebViews have no PublicKeyCredential;
     * PasskeyPlugin uses Credential Manager for those.
     */
    private void enableWebAuthn(WebView webView) {
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
                WebSettingsCompat.setWebAuthenticationSupport(
                    webView.getSettings(),
                    WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
                );
            }
        } catch (RuntimeException ex) {
            Log.w(TAG, "WebAuthn support was not enabled", ex);
        }
    }

    private WebView webViewOrNull() {
        try {
            if (getBridge() == null) return null;
            return getBridge().getWebView();
        } catch (RuntimeException ex) {
            Log.e(TAG, "WebView was not ready", ex);
            return null;
        }
    }

    private void failStoreToken(String flavor, String reason) {
        Log.e(TAG, "Store user-agent failed for " + flavor + ": " + reason);
        if ("huawei".equals(flavor) && BuildConfig.DEBUG) {
            throw new IllegalStateException("Huawei build is missing KidEaseStoreHuawei: " + reason);
        }
    }

    /** Play returns the shared KidEaseNative token only. Samsung, Huawei, and Amazon add their own. */
    static String userAgentForStoreBuild(String flavor, String base, String configured) {
        String next = base == null ? "" : base;
        if (!"samsung".equals(flavor)) {
            next = next.replace("KidEaseStoreSamsung", "");
        }
        if (!"huawei".equals(flavor)) {
            next = next.replace("KidEaseStoreHuawei", "");
        }
        if (!"amazon".equals(flavor)) {
            next = next.replace("KidEaseStoreAmazon", "");
        }
        next = next.replaceAll("\\s+", " ").trim();
        String token = "";
        if ("samsung".equals(flavor) && "KidEaseStoreSamsung".equals(configured)) token = configured;
        else if ("huawei".equals(flavor) && "KidEaseStoreHuawei".equals(configured)) token = configured;
        else if ("amazon".equals(flavor) && "KidEaseStoreAmazon".equals(configured)) token = configured;
        if (token.isEmpty()) return next;
        if (next.isEmpty()) return token;
        if (next.contains(token)) return next;
        return next + " " + token;
    }

    /** Drop KidEaseNoGms when Play services work. Add it when they do not. */
    static String userAgentWithPlayServices(String agent, boolean available) {
        String next = agent == null ? "" : agent.replace("KidEaseNoGms", "").replaceAll("\\s+", " ").trim();
        if (available) return next;
        if (next.isEmpty()) return "KidEaseNoGms";
        return next + " KidEaseNoGms";
    }

    static String withoutSamsungStoreQuery(String url) {
        if (url == null || !url.contains("store=samsung")) return url == null ? "" : url;
        return url
            .replace("?store=samsung&", "?")
            .replace("&store=samsung&", "&")
            .replace("?store=samsung", "")
            .replace("&store=samsung", "");
    }
}
