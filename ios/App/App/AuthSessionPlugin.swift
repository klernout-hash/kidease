import AuthenticationServices
import Capacitor

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
