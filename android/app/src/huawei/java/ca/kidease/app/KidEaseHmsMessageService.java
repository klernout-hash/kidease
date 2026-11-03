package ca.kidease.app;

import com.huawei.hms.push.HmsMessageService;
import com.huawei.hms.push.RemoteMessage;
import java.util.Map;

/**
 * Huawei flavour only. HMS Push Kit delivers call-ring data messages here.
 * The server sends nothing while FEATURE_CALL_PUSH is off. Token is stored
 * for a later registerCallDevice call with provider "hms". Do not register
 * this service on Play, Samsung, or Amazon.
 */
public class KidEaseHmsMessageService extends HmsMessageService {
    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getDataOfMap();
        IncomingCall.handle(this, data);
    }

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("kidease_call_push", MODE_PRIVATE).edit().putString("hms_token", token).apply();
    }
}
