package ca.kidease.app;

import android.content.Context;
import android.util.Log;

/**
 * True only when Google Play services answer SUCCESS (0).
 * AppGallery and Fire builds do not ship the library, so the lookup fails closed
 * and the site hides Continue with Google. A Play build on a phone without
 * Play services does the same.
 */
public final class PlayServicesStatus {
    private static final String TAG = "KidEase";

    private PlayServicesStatus() {}

    public static boolean available(Context context) {
        if (context == null) return false;
        try {
            Class<?> availability = Class.forName("com.google.android.gms.common.GoogleApiAvailability");
            Object instance = availability.getMethod("getInstance").invoke(null);
            Object code = availability
                .getMethod("isGooglePlayServicesAvailable", Context.class)
                .invoke(instance, context);
            return code instanceof Integer && ((Integer) code).intValue() == 0;
        } catch (ReflectiveOperationException ex) {
            return false;
        } catch (RuntimeException ex) {
            Log.w(TAG, "Play services check failed", ex);
            return false;
        }
    }
}
