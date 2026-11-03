package ca.kidease.app;

import android.content.Context;
import android.os.Bundle;
import com.huawei.hms.push.HmsMessageService;
import com.huawei.hms.push.RemoteMessage;
import java.util.Map;

/**
 * Huawei flavor only. HMS Push Kit data messages for the background call ring.
 * FEATURE_CALL_PUSH stays off, so nothing is sent until Kyle turns that flag on.
 * The token is stored on the device. The web shell posts it to push_device_tokens
 * with provider "hms" only after the server says the flag is on.
 */
public class KidEaseHmsMessageService extends HmsMessageService {
    static final String PREFS = "kidease_call_push";
    static final String TOKEN_KEY = "hms_token";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message == null ? null : message.getDataOfMap();
        IncomingCall.handle(this, data);
    }

    @Override
    public void onNewToken(String token) {
        saveToken(this, token);
    }

    @Override
    public void onNewToken(String token, Bundle bundle) {
        saveToken(this, token);
    }

    static void saveToken(Context context, String token) {
        if (context == null || token == null || token.isEmpty()) return;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(TOKEN_KEY, token).apply();
    }
}
