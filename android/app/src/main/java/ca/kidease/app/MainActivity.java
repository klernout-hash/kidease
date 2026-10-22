package ca.kidease.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * Play keeps the KidEaseNative token from capacitor.config.json.
 * Only the Samsung flavour may append KidEaseStoreSamsung, and only the
 * Huawei flavour may append KidEaseStoreHuawei. Play strips both.
 * The field is private on CapConfig; the public builder would drop SplashScreen and server.url.
 * Keep this in step with userAgentForStoreBuild in native-entitlements.ts.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        try {
            CapConfig defaults = CapConfig.loadDefault(this);
            String flavor = BuildConfig.FLAVOR;
            java.lang.reflect.Field uaField = CapConfig.class.getDeclaredField("appendedUserAgentString");
            uaField.setAccessible(true);
            String base = (String) uaField.get(defaults);
            String next = userAgentForStoreBuild(flavor, base, BuildConfig.STORE_UA_TOKEN);
            if (!next.equals(base == null ? "" : base)) {
                uaField.set(defaults, next.isEmpty() ? null : next);
                this.config = defaults;
            }
            if (!"samsung".equals(flavor)) {
                java.lang.reflect.Field urlField = CapConfig.class.getDeclaredField("serverUrl");
                urlField.setAccessible(true);
                String url = (String) urlField.get(defaults);
                String cleaned = withoutSamsungStoreQuery(url);
                if (url != null && !cleaned.equals(url)) {
                    urlField.set(defaults, cleaned);
                    this.config = defaults;
                }
            }
        } catch (Exception ignored) {
            // The site still loads. Without a store token this build looks like Play.
        }
        super.load();
    }

    /** Play returns the shared KidEaseNative token only. Samsung and Huawei add their own. */
    static String userAgentForStoreBuild(String flavor, String base, String configured) {
        String next = base == null ? "" : base;
        if (!"samsung".equals(flavor)) {
            next = next.replace("KidEaseStoreSamsung", "");
        }
        if (!"huawei".equals(flavor)) {
            next = next.replace("KidEaseStoreHuawei", "");
        }
        next = next.replaceAll("\\s+", " ").trim();
        String token = "";
        if ("samsung".equals(flavor) && "KidEaseStoreSamsung".equals(configured)) token = configured;
        else if ("huawei".equals(flavor) && "KidEaseStoreHuawei".equals(configured)) token = configured;
        if (token.isEmpty()) return next;
        if (next.isEmpty()) return token;
        if (next.contains(token)) return next;
        return next + " " + token;
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
