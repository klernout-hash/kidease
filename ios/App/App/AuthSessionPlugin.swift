import AuthenticationServices
import Capacitor
import LocalAuthentication
import Security

/// Google and Facebook sign-in. ASWebAuthenticationSession is not a webview,
/// so Google accepts it. The session ends on ca.kidease.app://auth/finish.
/// Registered from KidEaseBridgeViewController. A binary without this class
/// falls back to SFSafariViewController / Custom Tabs from the website.
@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?
    private var pending: CAPPluginCall?

    @objc func start(_ call: CAPPluginCall) {
        pending?.reject("cancelled")
        pending = nil
        session?.cancel()
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("Missing sign-in url")
            return
        }
        let scheme = call.getString("callbackScheme") ?? "ca.kidease.app"
        let next = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
            guard let self else { return }
            if let error = error as NSError?,
               error.domain == ASWebAuthenticationSessionError.errorDomain,
               error.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                self.pending?.reject("cancelled")
                self.finish()
                return
            }
            guard let callback else {
                self.pending?.reject("Sign-in did not finish")
                self.finish()
                return
            }
            self.pending?.resolve(["url": callback.absoluteString])
            self.finish()
        }
        next.presentationContextProvider = self
        next.prefersEphemeralWebBrowserSession = true
        session = next
        pending = call
        if !next.start() {
            call.reject("Could not open sign-in")
            finish()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let view = bridge?.webView, let window = view.window {
            return window
        }
        return ASPresentationAnchor()
    }

    private func finish() {
        pending = nil
        session = nil
    }
}

/// Keychain store for the phone session. Refresh does not ask for Face ID.
/// The step-up secret does. Registered from the same bridge file so the
/// Xcode target compiles it without a new project entry.
@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricAvailable", returnType: CAPPluginReturnPromise),
    ]

    private let service = "ca.kidease.app.session"

    @objc func biometricAvailable(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let ok = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        call.resolve(["available": ok])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value"), !key.isEmpty else {
            call.reject("Missing value")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let saved = self.write(key: key, value: value, stepUp: key == "stepup")
            DispatchQueue.main.async {
                if saved { call.resolve() } else { call.reject("Could not save") }
            }
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing value")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let value = self.read(key: key, stepUp: key == "stepup")
            DispatchQueue.main.async {
                call.resolve(["value": value as Any])
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing value")
            return
        }
        delete(key: key)
        call.resolve()
    }

    private func write(key: String, value: String, stepUp: Bool) -> Bool {
        delete(key: key)
        guard let data = value.data(using: .utf8) else { return false }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
        ]
        if stepUp {
            var error: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                .userPresence,
                &error
            ) else { return false }
            query[kSecAttrAccessControl as String] = access
        } else {
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private func read(key: String, stepUp: Bool) -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if stepUp {
            query[kSecUseOperationPrompt as String] = "Confirm it's you"
        }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
