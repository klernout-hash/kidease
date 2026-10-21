package ca.kidease.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * Play keeps the KidEaseNative token from capacitor.config.json.
 * Samsung and Huawei append a second token before the first page request
 * so the site can tell the stores apart. The field is private on CapConfig;
 * the public builder would drop SplashScreen and server.url.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        String token = BuildConfig.STORE_UA_TOKEN;
        if (token != null && !token.isEmpty()) {
            try {
                CapConfig defaults = CapConfig.loadDefault(this);
                java.lang.reflect.Field field = CapConfig.class.getDeclaredField("appendedUserAgentString");
                field.setAccessible(true);
                String base = (String) field.get(defaults);
                String next = base == null || base.isEmpty() ? token : base.contains(token) ? base : base + " " + token;
                field.set(defaults, next);
                this.config = defaults;
            } catch (Exception ignored) {
                // The site still loads. Without the token this build looks like Play.
            }
        }
        super.load();
    }
}
