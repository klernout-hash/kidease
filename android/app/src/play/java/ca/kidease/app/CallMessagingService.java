package ca.kidease.app;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Background ring (FEATURE_CALL_PUSH). FCM high-priority data messages with
 * type=call raise a full-screen incoming-call notification even when the app
 * is closed or the screen is locked. type=call-cancel stops it. Every other
 * message goes to the normal Capacitor push handler.
 */
public class CallMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (IncomingCall.handle(this, data)) return;
        super.onMessageReceived(message);
    }
}
