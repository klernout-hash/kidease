import ActivityKit
import Capacitor
import UIKit

/// Home-screen shortcuts, a widget snapshot, and a local Live Activity.
/// The website calls these only when the matching FEATURE_APPLE_* flag is on.
/// Nothing here runs at launch.
@objc(ApplePlatformPlugin)
public class ApplePlatformPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApplePlatformPlugin"
    public let jsName = "ApplePlatform"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "applyShortcuts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startLiveActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endLiveActivity", returnType: CAPPluginReturnPromise),
    ]

    private static let widgetKey = "kidease.homeWidget"
    private static let appGroup = "group.ca.kidease.app"

    @objc func applyShortcuts(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let rows = call.options["items"] as? [JSObject] ?? []
            var items: [UIApplicationShortcutItem] = []
            for row in rows.prefix(3) {
                guard let type = row["type"] as? String, Self.allowed(type),
                      let title = row["title"] as? String, !title.isEmpty,
                      let path = row["path"] as? String, path.hasPrefix("/") else { continue }
                let subtitle = row["subtitle"] as? String ?? ""
                items.append(UIApplicationShortcutItem(
                    type: type,
                    localizedTitle: String(title.prefix(40)),
                    localizedSubtitle: String(subtitle.prefix(40)),
                    icon: UIApplicationShortcutIcon(systemImageName: Self.icon(for: type)),
                    userInfo: ["path": path as NSString]
                ))
            }
            UIApplication.shared.shortcutItems = items
            call.resolve()
        }
    }

    @objc func writeWidget(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let line = call.getString("line") ?? ""
        let path = call.getString("path") ?? ""
        guard title == "KidEase", path == "/search", !line.isEmpty, line.count <= 120 else {
            call.reject("widget-snapshot-rejected")
            return
        }
        let payload: [String: String] = ["title": title, "line": line, "path": path]
        UserDefaults.standard.set(payload, forKey: Self.widgetKey)
        UserDefaults(suiteName: Self.appGroup)?.set(payload, forKey: Self.widgetKey)
        call.resolve()
    }

    @objc func startLiveActivity(_ call: CAPPluginCall) {
        guard Bundle.main.object(forInfoDictionaryKey: "NSSupportsLiveActivities") as? Bool == true else {
            call.reject("needs-info-plist")
            return
        }
        guard #available(iOS 16.2, *) else {
            call.reject("needs-ios-16-2")
            return
        }
        let child = call.getString("childName") ?? ""
        let kind = call.getString("kind") ?? ""
        let time = call.getString("timeLabel") ?? ""
        let centre = call.getString("centreName") ?? ""
        let title = call.getString("title") ?? ""
        guard !child.isEmpty, kind == "pickup" || kind == "dropoff", !time.isEmpty, !title.isEmpty else {
            call.reject("live-activity-rejected")
            return
        }
        let attributes = PickupAttributes(childName: child, kind: kind)
        let state = PickupAttributes.ContentState(timeLabel: time, centreName: centre, title: title)
        Task {
            do {
                _ = try Activity.request(attributes: attributes, content: .init(state: state, staleDate: nil), pushType: nil)
                call.resolve(["started": true])
            } catch {
                call.reject("live-activity-failed")
            }
        }
    }

    @objc func endLiveActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            for activity in Activity<PickupAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            call.resolve()
        }
    }

    static func allowed(_ type: String) -> Bool {
        type == "ca.kidease.shortcut.search" || type == "ca.kidease.shortcut.parent" || type == "ca.kidease.shortcut.help"
    }

    static func icon(for type: String) -> String {
        if type.hasSuffix(".search") { return "magnifyingglass" }
        if type.hasSuffix(".parent") { return "heart" }
        return "questionmark.circle"
    }

    /// Opens a KidEase shortcut path. Other shortcut types are ignored.
    static func path(for shortcut: UIApplicationShortcutItem?) -> String? {
        guard let shortcut, allowed(shortcut.type) else { return nil }
        if let path = shortcut.userInfo?["path"] as? String, path.hasPrefix("/"), !path.hasPrefix("//") {
            return path
        }
        if shortcut.type.hasSuffix(".search") { return "/search" }
        if shortcut.type.hasSuffix(".parent") { return "/parent" }
        if shortcut.type.hasSuffix(".help") { return "/help" }
        return nil
    }
}

struct PickupAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var timeLabel: String
        var centreName: String
        var title: String
    }

    var childName: String
    var kind: String
}
