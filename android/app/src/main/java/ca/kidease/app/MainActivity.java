package ca.kidease.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
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
    private final Handler offlineHandler = new Handler(Looper.getMainLooper());
    private int offlineWaits = 0;
    private ConnectivityManager.NetworkCallback offlineCallback;

    @Override
    protected void load() {
        // Register before the bridge is created. Capacitor copies initial plugins in super.load().
        // The flag is static. A relaunch in the same process must not inherit it.
        OfflinePage.reset();
        registerPlugin(PasskeyPlugin.class);
        registerPlugin(SecureSessionPlugin.class);
        StorePlugins.register(this);
        super.load();
        MessageChannel.ensure(this);
        installAdminWebOnlyClient();
        String flavor = BuildConfig.FLAVOR == null ? "" : BuildConfig.FLAVOR;
        applyStoreUserAgent(flavor);
        if (!"samsung".equals(flavor)) {
            dropSamsungStoreLink();
        }
        scheduleOfflineCheck();
        watchNetwork();
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
            playServicesForFlavor(flavor, PlayServicesStatus.available(this))
        );
        next = withAmazonDeviceToken(next, flavor, Build.MANUFACTURER);
        next = withCallMediaToken(next, declaresCallMedia());
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

    private void scheduleOfflineCheck() {
        offlineHandler.postDelayed(this::offlineTimedOut, 20000);
    }

    private void offlineTimedOut() {
        WebView web = webViewOrNull();
        if (web == null) return;
        String url = web.getUrl();
        boolean remote = url != null && (url.startsWith("https://www.kidease.ca") || url.startsWith("https://kidease.ca"));
        if (remote && web.getProgress() >= 90) {
            OfflinePage.reset();
            return;
        }
        if (remote && offlineWaits < 1) {
            offlineWaits += 1;
            offlineHandler.postDelayed(this::offlineTimedOut, 8000);
            return;
        }
        // A slow first load on a working network is not "offline". Keep waiting
        // (one fresh load), and let onReceivedError catch a real failure.
        if (hasValidatedNetwork() && offlineWaits < 3) {
            offlineWaits += 1;
            if (offlineWaits == 2) loadLiveSite(web);
            offlineHandler.postDelayed(this::offlineTimedOut, 10000);
            return;
        }
        OfflinePage.show(this, web);
    }

    /** True when Android has a network that reached the internet (not just a Wi-Fi link). */
    boolean hasValidatedNetwork() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return true;
        try {
            Network active = manager.getActiveNetwork();
            if (active == null) return false;
            NetworkCapabilities caps = manager.getNetworkCapabilities(active);
            if (caps == null) return false;
            return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } catch (RuntimeException ex) {
            Log.w(TAG, "Network check failed", ex);
            return true;
        }
    }

    private void loadLiveSite(WebView web) {
        if (web == null || getBridge() == null) return;
        String target = getBridge().getServerUrl();
        if (target == null || target.isEmpty()) target = "https://www.kidease.ca/";
        web.loadUrl(target);
    }

    /** Back online while the bundled page shows: reopen the live site by itself. */
    private void recoverFromOffline() {
        if (!OfflinePage.isShowing()) return;
        WebView web = webViewOrNull();
        if (web == null) return;
        OfflinePage.reset();
        offlineWaits = 0;
        loadLiveSite(web);
        offlineHandler.removeCallbacksAndMessages(null);
        scheduleOfflineCheck();
    }

    private void watchNetwork() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null || offlineCallback != null) return;
        offlineCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onLost(Network network) {
                // Wi-Fi to mobile hand-offs fire onLost too. Only show the page
                // when no other network picks up within a moment.
                offlineHandler.postDelayed(() -> {
                    if (!hasValidatedNetwork()) OfflinePage.show(MainActivity.this, webViewOrNull());
                }, 2500);
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                if (caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    runOnUiThread(MainActivity.this::recoverFromOffline);
                }
            }

            @Override
            public void onAvailable(Network network) {
                offlineHandler.postDelayed(() -> {
                    if (hasValidatedNetwork()) recoverFromOffline();
                }, 1200);
            }
        };
        try {
            manager.registerDefaultNetworkCallback(offlineCallback);
        } catch (RuntimeException ex) {
            Log.w(TAG, "Network callback was not registered", ex);
            offlineCallback = null;
        }
    }

    /**
     * A link opened while the app runs arrives here. Capacitor forwards it to the
     * page as appUrlOpen; if the page has not moved within a moment (listener not
     * ready, page still booting, offline page showing), load the path natively.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        final String path = deepLinkPath(intent.getData());
        if (path == null) return;
        offlineHandler.postDelayed(() -> {
            WebView web = webViewOrNull();
            if (web == null) return;
            String current = web.getUrl();
            String target = "https://www.kidease.ca" + path;
            if (current != null && (current.equals(target) || current.startsWith(target + "#"))) return;
            OfflinePage.reset();
            web.loadUrl(target);
        }, 900);
    }

    /** Path inside the site for kidease://, ca.kidease.app:// and https://(www.)kidease.ca links. Null otherwise. */
    static String deepLinkPath(Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        String path = uri.getPath() == null ? "" : uri.getPath();
        String query = uri.getEncodedQuery();
        String fragment = uri.getEncodedFragment();
        String out;
        if ("https".equals(scheme)) {
            if (!"www.kidease.ca".equals(host) && !"kidease.ca".equals(host)) return null;
            out = path.isEmpty() ? "/" : path;
        } else if ("kidease".equals(scheme) || "ca.kidease.app".equals(scheme)) {
            if (host.isEmpty() || "www.kidease.ca".equals(host) || "kidease.ca".equals(host)) out = path.isEmpty() ? "/" : path;
            else if (host.contains(".")) return null;
            else out = "/" + host + ("/".equals(path) ? "" : path);
        } else {
            return null;
        }
        if (!out.startsWith("/") || out.startsWith("//") || out.contains("\\")) return null;
        if (query != null && !query.isEmpty()) out += "?" + query;
        if (fragment != null && !fragment.isEmpty()) out += "#" + fragment;
        return out;
    }

    @Override
    public void onDestroy() {
        offlineHandler.removeCallbacksAndMessages(null);
        if (offlineCallback != null) {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (manager != null) {
                try {
                    manager.unregisterNetworkCallback(offlineCallback);
                } catch (RuntimeException ex) {
                    Log.w(TAG, "Network callback was already gone", ex);
                }
            }
        }
        super.onDestroy();
    }

    /** Play, Samsung, Huawei, and Amazon must send KidEaseNative so the site can tell a shell from the website. */
    static String ensureNativeToken(String agent) {
        String next = agent == null ? "" : agent.trim();
        if (next.contains(NATIVE_TOKEN)) return next;
        if (next.isEmpty()) return NATIVE_TOKEN;
        return next + " " + NATIVE_TOKEN;
    }

    void registerStorePlugin(Class<? extends com.getcapacitor.Plugin> plugin) {
        registerPlugin(plugin);
    }

    static final String AMAZON_DEVICE_TOKEN = "KidEaseAmazonDevice";

    /**
     * Amazon-only features (ADM, Login with Amazon, Fire kiosk) need BOTH the amazon
     * flavour AND an Amazon-made device. Every other flavour strips the token.
     */
    static String withAmazonDeviceToken(String agent, String flavor, String manufacturer) {
        String next = agent == null ? "" : agent.replace(AMAZON_DEVICE_TOKEN, "").replaceAll("\\s+", " ").trim();
        boolean amazonFlavor = flavor != null && flavor.startsWith("amazon");
        boolean amazonDevice = manufacturer != null && manufacturer.trim().equalsIgnoreCase("Amazon");
        if (amazonFlavor && amazonDevice) return next.isEmpty() ? AMAZON_DEVICE_TOKEN : next + " " + AMAZON_DEVICE_TOKEN;
        return next;
    }

    /**
     * KidEaseCallMedia tells the site this build can use the camera and
     * microphone, so it may show Call and Video. Added only when the package
     * declares both CAMERA and RECORD_AUDIO (a KIDEASE_ANDROID_CALL_MEDIA=1
     * build). Current store builds strip them, so they never send it.
     */
    static final String CALL_MEDIA_TOKEN = "KidEaseCallMedia";

    static String withCallMediaToken(String agent, boolean declared) {
        String next = agent == null ? "" : agent.replace(CALL_MEDIA_TOKEN, "").replaceAll("\\s+", " ").trim();
        if (!declared) return next;
        return next.isEmpty() ? CALL_MEDIA_TOKEN : next + " " + CALL_MEDIA_TOKEN;
    }

    static boolean declaresBoth(String[] requested) {
        if (requested == null) return false;
        boolean camera = false;
        boolean mic = false;
        for (String name : requested) {
            if ("android.permission.CAMERA".equals(name)) camera = true;
            if ("android.permission.RECORD_AUDIO".equals(name)) mic = true;
        }
        return camera && mic;
    }

    private boolean declaresCallMedia() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS);
            return declaresBoth(info.requestedPermissions);
        } catch (Exception e) {
            return false;
        }
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

    /**
     * The huawei flavor never reports Play services, so Continue with Google
     * stays hidden even if a later library adds a stub. Other flavors use the
     * real check. A missing library already fails closed.
     */
    static boolean playServicesForFlavor(String flavor, boolean detected) {
        if ("huawei".equals(flavor)) return false;
        return detected;
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
