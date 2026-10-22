// swift-tools-version: 5.9
import PackageDescription

// Privacy manifests for SDKs that do not ship one. Linked from the App target
// so Xcode copies each resource bundle into the archive. CapApp-SPM is regenerated
// by Capacitor, so this package stays beside it.
let package = Package(
    name: "SdkPrivacy",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "SdkPrivacy", targets: ["SdkPrivacy"])
    ],
    targets: [
        .target(
            name: "SdkPrivacy",
            dependencies: [
                "CapacitorAppPrivacy",
                "CapacitorBrowserPrivacy",
                "CapacitorHapticsPrivacy",
                "CapacitorKeyboardPrivacy",
                "CapacitorSharePrivacy",
                "CapacitorSplashScreenPrivacy",
                "CapacitorStatusBarPrivacy",
                "CapacitorInAppReviewPrivacy",
                "CapacitorGeolocationPrivacy",
                "CapacitorPreferencesPrivacy",
                "SentryPrivacy",
                "PostHogPrivacy"
            ],
            path: "Sources/SdkPrivacy"
        ),
        .target(
            name: "CapacitorAppPrivacy",
            path: "Sources/CapacitorAppPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorBrowserPrivacy",
            path: "Sources/CapacitorBrowserPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorHapticsPrivacy",
            path: "Sources/CapacitorHapticsPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorKeyboardPrivacy",
            path: "Sources/CapacitorKeyboardPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorSharePrivacy",
            path: "Sources/CapacitorSharePrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorSplashScreenPrivacy",
            path: "Sources/CapacitorSplashScreenPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorStatusBarPrivacy",
            path: "Sources/CapacitorStatusBarPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorInAppReviewPrivacy",
            path: "Sources/CapacitorInAppReviewPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorGeolocationPrivacy",
            path: "Sources/CapacitorGeolocationPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "CapacitorPreferencesPrivacy",
            path: "Sources/CapacitorPreferencesPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "SentryPrivacy",
            path: "Sources/SentryPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
        .target(
            name: "PostHogPrivacy",
            path: "Sources/PostHogPrivacy",
            resources: [.process("PrivacyInfo.xcprivacy")]
        ),
    ]
)
