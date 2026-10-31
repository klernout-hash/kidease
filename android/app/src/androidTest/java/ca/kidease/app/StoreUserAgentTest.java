package ca.kidease.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Each flavour's WebView must carry its own store token.
 * Play keeps KidEaseNative and drops the Samsung and Huawei tokens.
 */
@RunWith(AndroidJUnit4.class)
public class StoreUserAgentTest {
    @Test
    public void webViewUserAgentMatchesFlavour() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(Intent.ACTION_MAIN);
        intent.setClassName("ca.kidease.app", "ca.kidease.app.MainActivity");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        try {
            MainActivity main = (MainActivity) activity;
            String[] holder = new String[1];
            instrumentation.runOnMainSync(() -> holder[0] = main.getBridge().getWebView().getSettings().getUserAgentString());
            String ua = holder[0] == null ? "" : holder[0];
            String flavor = BuildConfig.FLAVOR == null ? "" : BuildConfig.FLAVOR;
            String token = BuildConfig.STORE_UA_TOKEN == null ? "" : BuildConfig.STORE_UA_TOKEN;
            assertTrue(ua.contains("KidEaseNative"));
            if ("samsung".equals(flavor)) {
                assertTrue(ua.contains("KidEaseStoreSamsung"));
                assertFalse(ua.contains("KidEaseStoreHuawei"));
            } else if ("huawei".equals(flavor)) {
                assertTrue(ua.contains("KidEaseStoreHuawei"));
                assertFalse(ua.contains("KidEaseStoreSamsung"));
                assertFalse(ua.contains("KidEaseStoreAmazon"));
                assertTrue(ua.contains("KidEaseNoGms"));
            } else if ("amazon".equals(flavor)) {
                assertTrue(ua.contains("KidEaseStoreAmazon"));
                assertFalse(ua.contains("KidEaseStoreSamsung"));
                assertFalse(ua.contains("KidEaseStoreHuawei"));
                assertTrue(ua.contains("KidEaseNoGms"));
            } else {
                assertFalse(ua.contains("KidEaseStoreSamsung"));
                assertFalse(ua.contains("KidEaseStoreHuawei"));
                assertFalse(ua.contains("KidEaseStoreAmazon"));
            }
            if (!token.isEmpty()) {
                assertTrue(ua.contains(token));
            }
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
