package ca.kidease.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Decline from the ringing notification: stop ringing locally. The caller sees the 25 s timeout. */
public class CallDeclineReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String ringId = intent.getStringExtra("ringId");
        if (ringId == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(IncomingCall.notificationId(ringId));
    }
}
