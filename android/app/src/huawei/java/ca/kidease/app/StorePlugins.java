package ca.kidease.app;

/** huawei flavour: no Amazon plugins. CI fails if ADM or Login with Amazon classes appear in this build. */
final class StorePlugins {
    private StorePlugins() {}

    static void register(MainActivity activity) {}
}
