package ca.kidease.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/** Ordinary messages. Not a call, and not a time-critical alert. */
public final class MessageChannel {
    public static final String ID = "kidease_messages";

    private MessageChannel() {}

    public static void ensure(Context ctx) {
        if (Build.VERSION.SDK_INT < 26 || ctx == null) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            ID,
            ctx.getString(R.string.messages_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(ctx.getString(R.string.messages_channel_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
    }
}
