package ca.kidease.app;

/** Amazon flavour: ADM plugin. Each flavour has its own StorePlugins with only its own SDK glue. */
final class StorePlugins {
    private StorePlugins() {}

    static void register(MainActivity activity) {
        activity.registerStorePlugin(AmazonAdmPlugin.class);
    }
}
