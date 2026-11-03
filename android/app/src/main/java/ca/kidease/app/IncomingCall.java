package ca.kidease.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.Map;

/** Shared by FCM and HMS: shows / cancels the ringing call notification. No phone numbers. */
public final class IncomingCall {
    static final String CHANNEL = "kidease_calls";
    static final long RING_MS = 25_000L;

    private IncomingCall() {}

    static int notificationId(String ringId) {
        return ("call-" + ringId).hashCode();
    }

    /** @return true when the data message was a call message and was handled. */
    public static boolean handle(Context ctx, Map<String, String> data) {
        if (data == null) return false;
        String type = data.get("type");
        String ringId = data.get("ringId");
        if (ringId == null || type == null) return false;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if ("call-cancel".equals(type)) {
            nm.cancel(notificationId(ringId));
            return true;
        }
        if (!"call".equals(type)) return false;
        ensureChannel(ctx, nm);
        String caller = data.get("callerName") != null ? data.get("callerName") : "KidEase";
        boolean video = "video".equals(data.get("media"));
        String path = data.get("url") != null && data.get("url").startsWith("/") ? data.get("url") : "/inbox";
        Uri link = Uri.parse("https://www.kidease.ca" + path);

        Intent answer = new Intent(Intent.ACTION_VIEW, link, ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent answerPi = PendingIntent.getActivity(ctx, notificationId(ringId), answer, flags);
        Intent decline = new Intent(ctx, CallDeclineReceiver.class).putExtra("ringId", ringId);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, notificationId(ringId) + 1, decline, flags);

        Person person = new Person.Builder().setName(caller).setImportant(true).build();
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(caller)
            .setContentText(video ? "KidEase video call" : "KidEase call")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(true)
            .setTimeoutAfter(RING_MS)
            .setFullScreenIntent(answerPi, true)
            .setContentIntent(answerPi)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, declinePi, answerPi).setIsVideo(video));
        nm.notify(notificationId(ringId), b.build());
        return true;
    }

    static void ensureChannel(Context ctx, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26 || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Calls", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Incoming KidEase calls");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }
}
