package ca.kidease.app;

/** huawei flavour: HMS push plugin only. No Amazon, Firebase, or Play Services classes. */
final class StorePlugins {
    private StorePlugins() {}

    static void register(MainActivity activity) {
        activity.registerStorePlugin(HuaweiPushPlugin.class);
    }
}
