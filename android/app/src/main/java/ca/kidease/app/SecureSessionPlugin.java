package ca.kidease.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * Android Keystore for the phone session. The refresh secret does not ask
 * for the lock screen. The step-up secret does. Ciphertext stays in the
 * app's private files. The key never leaves the keystore.
 */
@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final int CONFIRM = 4108;
    private static final String ANDROID_STORE = "AndroidKeyStore";
    private String pendingOp;
    private String pendingKey;
    private String pendingValue;

    @PluginMethod
    public void biometricAvailable(PluginCall call) {
        KeyguardManager manager = manager();
        JSObject ret = new JSObject();
        ret.put("available", manager != null && manager.isDeviceSecure());
        call.resolve(ret);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null || key.isEmpty()) {
            call.reject("Missing value");
            return;
        }
        if ("stepup".equals(key)) {
            confirm(call, "set", key, value);
            return;
        }
        if (write(key, value, false)) call.resolve();
        else call.reject("Could not save");
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Missing value");
            return;
        }
        if ("stepup".equals(key)) {
            confirm(call, "get", key, null);
            return;
        }
        resolveValue(call, read(key, false));
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Missing value");
            return;
        }
        try {
            JSONObject all = load();
            all.remove(key);
            save(all);
            call.resolve();
        } catch (Exception err) {
            call.reject("Could not remove");
        }
    }

    private void confirm(PluginCall call, String op, String key, String value) {
        KeyguardManager manager = manager();
        if (manager == null || !manager.isDeviceSecure() || getActivity() == null) {
            call.reject("unavailable");
            return;
        }
        Intent intent = manager.createConfirmDeviceCredentialIntent("KidEase", "Confirm it's you");
        if (intent == null) {
            call.reject("unavailable");
            return;
        }
        pendingOp = op;
        pendingKey = key;
        pendingValue = value;
        startActivityForResult(call, intent, CONFIRM);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != CONFIRM) return;
        PluginCall call = getSavedCall();
        if (call == null) return;
        if (resultCode != android.app.Activity.RESULT_OK) {
            call.reject("cancelled");
            freeSavedCall();
            return;
        }
        boolean wrote = !"set".equals(pendingOp) || write(pendingKey, pendingValue, true);
        if (!wrote) {
            call.reject("Could not save");
        } else if ("get".equals(pendingOp)) {
            resolveValue(call, read(pendingKey, true));
        } else {
            call.resolve();
        }
        freeSavedCall();
    }

    private void resolveValue(PluginCall call, String value) {
        JSObject ret = new JSObject();
        ret.put("value", value == null ? "" : value);
        call.resolve(ret);
    }

    private KeyguardManager manager() {
        if (getContext() == null) return null;
        return (KeyguardManager) getContext().getSystemService(android.content.Context.KEYGUARD_SERVICE);
    }

    private boolean write(String key, String value, boolean stepUp) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret(stepUp));
            byte[] iv = cipher.getIV();
            byte[] enc = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] packed = new byte[iv.length + enc.length];
            System.arraycopy(iv, 0, packed, 0, iv.length);
            System.arraycopy(enc, 0, packed, iv.length, enc.length);
            JSONObject all = load();
            all.put(key, Base64.encodeToString(packed, Base64.NO_WRAP));
            save(all);
            return true;
        } catch (Exception err) {
            return false;
        }
    }

    private String read(String key, boolean stepUp) {
        try {
            String packed = load().optString(key, "");
            if (packed.isEmpty()) return null;
            byte[] raw = Base64.decode(packed, Base64.NO_WRAP);
            if (raw.length < 13) return null;
            byte[] iv = new byte[12];
            byte[] enc = new byte[raw.length - 12];
            System.arraycopy(raw, 0, iv, 0, 12);
            System.arraycopy(raw, 12, enc, 0, enc.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secret(stepUp), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(enc), StandardCharsets.UTF_8);
        } catch (Exception err) {
            return null;
        }
    }

    private SecretKey secret(boolean stepUp) throws Exception {
        String alias = stepUp ? "kidease_stepup" : "kidease_refresh";
        KeyStore store = KeyStore.getInstance(ANDROID_STORE);
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_STORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256);
        if (stepUp) {
            builder.setUserAuthenticationRequired(true);
            builder.setUserAuthenticationValidityDurationSeconds(60);
        }
        generator.init(builder.build());
        return generator.generateKey();
    }

    private File file() {
        if (getContext() == null) return new File("kidease-session.bin");
        return new File(getContext().getFilesDir(), "kidease-session.bin");
    }

    private JSONObject load() {
        File target = file();
        if (target == null || !target.exists()) return new JSONObject();
        try (FileInputStream in = new FileInputStream(target)) {
            byte[] raw = new byte[(int) target.length()];
            int read = in.read(raw);
            if (read <= 0) return new JSONObject();
            return new JSONObject(new String(raw, 0, read, StandardCharsets.UTF_8));
        } catch (Exception err) {
            return new JSONObject();
        }
    }

    private void save(JSONObject all) throws Exception {
        try (FileOutputStream out = new FileOutputStream(file())) {
            out.write(all.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
