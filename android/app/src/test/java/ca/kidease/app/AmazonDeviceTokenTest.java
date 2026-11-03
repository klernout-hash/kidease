package ca.kidease.app;

import static org.junit.Assert.*;

import org.junit.Test;

public class AmazonDeviceTokenTest {
    private static final String UA = "Mozilla/5.0 (Linux; Android 11; KFTRWI) KidEaseNative KidEaseStoreAmazon";

    @Test
    public void amazonFlavorOnAmazonDeviceGetsToken() {
        assertTrue(MainActivity.withAmazonDeviceToken(UA, "amazon", "Amazon").endsWith("KidEaseAmazonDevice"));
    }

    @Test
    public void amazonFlavorOnOtherMakerHasNoToken() {
        assertFalse(MainActivity.withAmazonDeviceToken(UA, "amazon", "samsung").contains("KidEaseAmazonDevice"));
    }

    @Test
    public void otherFlavorsNeverGetToken() {
        for (String flavor : new String[] {"play", "samsung", "huawei"}) {
            String out = MainActivity.withAmazonDeviceToken(UA + " KidEaseAmazonDevice", flavor, "Amazon");
            assertFalse(flavor, out.contains("KidEaseAmazonDevice"));
        }
    }

    @Test
    public void storeConstantMatchesFlavor() {
        assertEquals(BuildConfig.FLAVOR, BuildConfig.STORE);
    }
}
