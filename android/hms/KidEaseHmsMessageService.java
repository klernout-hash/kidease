package ca.kidease.app;

import com.huawei.hms.push.HmsMessageService;
import com.huawei.hms.push.RemoteMessage;
import java.util.Map;

/**
 * Huawei (no Google Play services) build only. Not compiled in the Play build.
 * To enable: add the huawei flavor with com.huawei.hms:push and
 * agconnect-services.json, copy this file into that flavor's source set, and
 * register the service with the com.huawei.push.action.MESSAGING_EVENT filter.
 * Token goes to registerCallDevice with provider "hms", platform "huawei".
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
