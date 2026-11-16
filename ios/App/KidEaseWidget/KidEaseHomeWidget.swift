import WidgetKit
import SwiftUI

/// Home-screen widget source. It is not in the app target, so the shipped
/// app does not show a widget until Kyle adds a Widget Extension, the App
/// Group `group.ca.kidease.app`, and turns FEATURE_APPLE_HOME_WIDGET on.
/// The snapshot is public search copy. It has no child name, fee, or rating.

struct KidEaseWidgetEntry: TimelineEntry {
    let date: Date
    let line: String
}

struct KidEaseWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> KidEaseWidgetEntry {
        KidEaseWidgetEntry(date: Date(), line: "Search licensed childcare in Canada.")
    }

    func getSnapshot(in context: Context, completion: @escaping (KidEaseWidgetEntry) -> Void) {
        completion(load())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KidEaseWidgetEntry>) -> Void) {
        let entry = load()
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(3600))))
    }

    private func load() -> KidEaseWidgetEntry {
        let suite = UserDefaults(suiteName: "group.ca.kidease.app")
        let line = suite?.string(forKey: "line") ?? suite?.dictionary(forKey: "kidease.homeWidget")?["line"] as? String
        let text = (line?.isEmpty == false) ? line! : "Search licensed childcare in Canada."
        return KidEaseWidgetEntry(date: Date(), line: String(text.prefix(120)))
    }
}

struct KidEaseHomeWidgetView: View {
    var entry: KidEaseWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("KidEase")
                .font(.headline)
            Text(entry.line)
                .font(.subheadline)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding()
        .widgetURL(URL(string: "https://www.kidease.ca/search"))
    }
}

struct KidEaseHomeWidget: Widget {
    let kind = "KidEaseHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: KidEaseWidgetProvider()) { entry in
            KidEaseHomeWidgetView(entry: entry)
        }
        .configurationDisplayName("KidEase")
        .description("Search licensed childcare in Canada.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
