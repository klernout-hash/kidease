package ca.kidease.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * Play in-app updates, dynamic shortcuts, and Play Integrity.
 * The website calls these only when the matching FEATURE_PLAY_* flag is on.
 * The integrity token is not returned to JavaScript and is not logged.
 */
@CapacitorPlugin(name = "PlayPlatform")
public class PlayPlatformPlugin extends Plugin {
    @PluginMethod
    public void checkUpdate(PluginCall call) {
        if (!"play".equals(BuildConfig.STORE)) {
            call.reject("not-play");
            return;
        }
        boolean start = Boolean.TRUE.equals(call.getBoolean("start", false));
        AppUpdateManager manager = AppUpdateManagerFactory.create(getContext());
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE);
            if (start && available && getActivity() != null) {
                manager.startUpdateFlow(
                    info,
                    getActivity(),
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
                );
            }
            JSObject out = new JSObject();
            out.put("available", available);
            call.resolve(out);
        }).addOnFailureListener(error -> call.reject("update-check-failed"));
    }

    @PluginMethod
    public void applyShortcuts(PluginCall call) {
        if (Build.VERSION.SDK_INT < 25) {
            call.resolve();
            return;
        }
        ShortcutManager manager = getContext().getSystemService(ShortcutManager.class);
        if (manager == null) {
            call.resolve();
            return;
        }
        List<ShortcutInfo> items = new ArrayList<>();
        JSArray rows = call.getArray("items");
        int count = rows == null ? 0 : Math.min(3, rows.length());
        for (int i = 0; i < count; i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            String id = row.optString("id");
            String path = row.optString("path");
            String title = row.optString("title");
            if (!allowed(id) || !path.startsWith("/") || path.startsWith("//") || title.isEmpty()) continue;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.kidease.ca" + path));
            intent.setPackage(getContext().getPackageName());
            items.add(new ShortcutInfo.Builder(getContext(), id)
                .setShortLabel(title.substring(0, Math.min(40, title.length())))
                .setIntent(intent)
                .build());
        }
        manager.setDynamicShortcuts(items);
        call.resolve();
    }

    @PluginMethod
    public void requestIntegrity(PluginCall call) {
        if (!"play".equals(BuildConfig.STORE)) {
            call.reject("not-play");
            return;
        }
        String projectRaw = getContext().getString(R.string.play_integrity_project_number).trim();
        if (!projectRaw.matches("\\d{6,20}")) {
            call.reject("needs-cloud-project-number");
            return;
        }
        String nonce = call.getString("nonce", "");
        if (nonce.length() < 16 || nonce.length() > 80) {
            call.reject("nonce-rejected");
            return;
        }
        long project = Long.parseLong(projectRaw);
        IntegrityManagerFactory.create(getContext())
            .requestIntegrityToken(
                IntegrityTokenRequest.builder().setCloudProjectNumber(project).setNonce(nonce).build()
            )
            .addOnSuccessListener(response -> {
                String token = response.token();
                JSObject out = new JSObject();
                out.put("ready", token != null && !token.isEmpty());
                call.resolve(out);
            })
            .addOnFailureListener(error -> call.reject("integrity-failed"));
    }

    private static boolean allowed(String id) {
        return "search".equals(id) || "parent".equals(id) || "help".equals(id);
    }
}
