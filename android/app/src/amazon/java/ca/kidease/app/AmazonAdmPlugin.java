package ca.kidease.app;

import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.Method;

/**
 * Amazon Device Messaging registration. Lives ONLY in the amazon source set, so
 * Play, Samsung, and Huawei builds never contain it (CI dex scan enforces this).
 * The ADM SDK is provided by Fire OS at runtime (amazon-device-messaging is a
 * stub jar, never bundled), so we call it by reflection. Off unless the web side
 * asks, and the web side only asks when FEATURE_AMAZON_ADM is on.
 */
@CapacitorPlugin(name = "KidEaseAdm")
public class AmazonAdmPlugin extends Plugin {
    static volatile String lastRegistrationId = "";

    @PluginMethod
    public void register(PluginCall call) {
        if (!"amazon".equals(BuildConfig.STORE) || !"Amazon".equalsIgnoreCase(Build.MANUFACTURER)) {
            call.reject("not-amazon-device");
            return;
        }
        try {
            Class<?> admClass = Class.forName("com.amazon.device.messaging.ADM");
            Object adm = admClass.getConstructor(android.content.Context.class).newInstance(getContext());
            Method supported = admClass.getMethod("isSupported");
            if (!(Boolean) supported.invoke(adm)) {
                call.reject("adm-unsupported");
                return;
            }
            String id = (String) admClass.getMethod("getRegistrationId").invoke(adm);
            if (id == null || id.isEmpty()) {
                admClass.getMethod("startRegister").invoke(adm);
                id = lastRegistrationId;
            }
            JSObject out = new JSObject();
            out.put("registrationId", id == null ? "" : id);
            call.resolve(out);
        } catch (ClassNotFoundException e) {
            call.reject("adm-missing");
        } catch (Exception e) {
            call.reject("adm-failed");
        }
    }
}
