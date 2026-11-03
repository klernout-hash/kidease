package ca.kidease.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.huawei.hms.aaid.HmsInstanceId;

/**
 * HMS token for the huawei flavor only. Play, Samsung, and Amazon do not
 * compile this class. The web shell calls register only when FEATURE_CALL_PUSH
 * is on. Without agconnect-services.json, getToken fails and we return the
 * saved token, which is empty until Push Kit is configured.
 */
@CapacitorPlugin(name = "KidEaseHms")
public class HuaweiPushPlugin extends Plugin {
    @PluginMethod
    public void register(PluginCall call) {
        if (!"huawei".equals(BuildConfig.STORE)) {
            call.reject("not-huawei");
            return;
        }
        new Thread(() -> {
            JSObject out = new JSObject();
            out.put("token", readToken());
            call.resolve(out);
        }, "kidease-hms").start();
    }

    private String readToken() {
        String stored = getContext()
            .getSharedPreferences(KidEaseHmsMessageService.PREFS, android.content.Context.MODE_PRIVATE)
            .getString(KidEaseHmsMessageService.TOKEN_KEY, "");
        try {
            String fresh = HmsInstanceId.getInstance(getContext()).getToken();
            if (fresh != null && !fresh.isEmpty()) {
                KidEaseHmsMessageService.saveToken(getContext(), fresh);
                return fresh;
            }
        } catch (Exception ignored) {
            // No agconnect-services.json, or Push Kit is not on for this app yet.
        }
        return stored == null ? "" : stored;
    }
}
