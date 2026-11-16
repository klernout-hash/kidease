import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = KidEaseBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        if let shortcut = connectionOptions.shortcutItem {
            DispatchQueue.main.async { [weak self] in
                _ = self?.openShortcut(shortcut)
            }
        }
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(openShortcut(shortcutItem))
    }

    /// KidEase shortcut types only. A launch with no shortcut item does not call this.
    private func openShortcut(_ shortcut: UIApplicationShortcutItem) -> Bool {
        guard let path = ApplePlatformPlugin.path(for: shortcut),
              let controller = window?.rootViewController as? KidEaseBridgeViewController else { return false }
        controller.openAppPath(path)
        return true
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
