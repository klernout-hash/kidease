package ca.kidease.app;

import static org.junit.Assert.*;

import org.junit.Test;

public class CallMediaTokenTest {
    private static final String UA = "Mozilla/5.0 (Linux; Android 14) KidEaseNative";

    @Test
    public void heldBuildNeverSendsToken() {
        assertFalse(MainActivity.withCallMediaToken(UA + " KidEaseCallMedia", false).contains("KidEaseCallMedia"));
    }

    @Test
    public void callMediaBuildSendsTokenOnce() {
        String once = MainActivity.withCallMediaToken(UA, true);
        assertTrue(once.endsWith("KidEaseCallMedia"));
        assertEquals(once, MainActivity.withCallMediaToken(once, true));
    }

    @Test
    public void needsCameraAndMicrophone() {
        assertTrue(MainActivity.declaresBoth(new String[] {"android.permission.CAMERA", "android.permission.RECORD_AUDIO"}));
        assertFalse(MainActivity.declaresBoth(new String[] {"android.permission.CAMERA"}));
        assertFalse(MainActivity.declaresBoth(null));
    }
}
