package ca.kidease.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class HuaweiPlayServicesTest {
    @Test
    public void huaweiNeverReportsPlayServices() {
        assertFalse(MainActivity.playServicesForFlavor("huawei", true));
        assertFalse(MainActivity.playServicesForFlavor("huawei", false));
    }

    @Test
    public void otherFlavorsKeepTheRealCheck() {
        assertTrue(MainActivity.playServicesForFlavor("play", true));
        assertFalse(MainActivity.playServicesForFlavor("play", false));
        assertTrue(MainActivity.playServicesForFlavor("samsung", true));
        assertFalse(MainActivity.playServicesForFlavor("amazon", false));
    }
}
