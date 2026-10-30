import AuthenticationServices
import Capacitor
import Foundation

/// System Sign in with Apple sheet. WKWebView cannot present ASAuthorization itself.
/// Registered from KidEaseBridgeViewController. The web redirect remains the fallback.
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ]

    private var authController: ASAuthorizationController?
    private var pendingCall: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        // ASAuthorizationController must be created and performed on the main thread.
        // A bridge call from the WebView can arrive off-main and Apple then fails the sheet.
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Sign in with Apple failed")
                return
            }
            self.pendingCall?.reject("cancelled")
            self.pendingCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = call.getString("nonce"), !nonce.isEmpty {
                request.nonce = nonce
            }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.authController = controller
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            pendingCall?.reject("Apple did not return an identity token")
            finish()
            return
        }
        guard let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8),
              !token.isEmpty else {
            pendingCall?.reject("Apple did not return an identity token")
            finish()
            return
        }
        var result: [String: Any] = [
            "identityToken": token,
            "user": credential.user,
        ]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8), !code.isEmpty {
            result["authorizationCode"] = code
        }
        if let email = credential.email { result["email"] = email }
        if let given = credential.fullName?.givenName { result["givenName"] = given }
        if let family = credential.fullName?.familyName { result["familyName"] = family }
        pendingCall?.resolve(result)
        finish()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain && nsError.code == ASAuthorizationError.canceled.rawValue {
            pendingCall?.reject("cancelled")
        } else {
            pendingCall?.reject("Sign in with Apple failed (\(nsError.domain) \(nsError.code))")
        }
        finish()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let view = bridge?.webView, let window = view.window {
            return window
        }
        return ASPresentationAnchor()
    }

    private func finish() {
        pendingCall = nil
        authController = nil
    }
}
