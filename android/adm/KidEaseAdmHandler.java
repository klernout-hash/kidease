package ca.kidease.app;

import android.content.Intent;
import android.os.Bundle;
import com.amazon.device.messaging.ADMMessageHandlerJobBase;
import java.util.HashMap;
import java.util.Map;

/**
 * Amazon Fire build only (no Google Play services). Not compiled in the Play build.
 * To enable: add the amazon flavor with amazon-device-messaging.jar (compileOnly) and
 * assets/api_key.txt, then copy this file into that flavor's source set.
 * Token goes to registerCallDevice with provider "adm", platform "amazon".
 */
public class KidEaseAdmHandler extends ADMMessageHandlerJobBase {
    @Override
    protected void onMessage(android.content.Context ctx, Intent intent) {
        Bundle extras = intent.getExtras();
        if (extras == null) return;
        Map<String, String> data = new HashMap<>();
        for (String k : extras.keySet()) {
            Object v = extras.get(k);
            if (v instanceof String) data.put(k, (String) v);
        }
        IncomingCall.handle(ctx, data);
    }

    @Override
    protected void onRegistered(android.content.Context ctx, String registrationId) {
        ctx.getSharedPreferences("kidease_call_push", 0).edit().putString("adm_token", registrationId).apply();
    }

    @Override
    protected void onUnregistered(android.content.Context ctx, String registrationId) {}

    @Override
    protected void onRegistrationError(android.content.Context ctx, String errorId) {}
}
