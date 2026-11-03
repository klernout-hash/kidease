import Foundation
import Capacitor
import PushKit
import CallKit
import AVFAudio

/// Background ring for KidEase calls (FEATURE_CALL_PUSH).
/// PushKit delivers a VoIP push even when the app is closed or the phone is locked;
/// iOS requires every VoIP push to be reported to CallKit right away, so the system
/// incoming-call screen shows "<caller> — KidEase". Answer opens the in-app call.
/// No phone numbers are used: the CallKit handle is the opaque KidEase thread id.
@objc(CallKitVoipPlugin)
public class CallKitVoipPlugin: CAPPlugin, CAPBridgedPlugin, PKPushRegistryDelegate, CXProviderDelegate {
    public let identifier = "CallKitVoipPlugin"
    public let jsName = "CallKitVoip"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endCall", returnType: CAPPluginReturnPromise),
    ]

    private var registry: PKPushRegistry?
    private var provider: CXProvider?
    private let controller = CXCallController()
    private var calls: [UUID: [String: String]] = [:]
    private var ringIds: [String: UUID] = [:]

    public override func load() {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = false
        let p = CXProvider(configuration: config)
        p.setDelegate(self, queue: nil)
        provider = p
    }

    @objc func register(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let r = PKPushRegistry(queue: .main)
            r.delegate = self
            r.desiredPushTypes = [.voIP]
            self.registry = r
            call.resolve()
        }
    }

    @objc func endCall(_ call: CAPPluginCall) {
        if let ringId = call.getString("ringId"), let uuid = ringIds[ringId] {
            provider?.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
            calls[uuid] = nil
            ringIds[ringId] = nil
        }
        call.resolve()
    }

    public func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        notifyListeners("voipToken", data: ["token": token])
    }

    public func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        var data: [String: String] = [:]
        for (k, v) in payload.dictionaryPayload { if let key = k as? String, let s = v as? String { data[key] = s } }
        let ringId = data["ringId"] ?? UUID().uuidString
        if data["type"] == "call-cancel" {
            // iOS still requires a reported call per VoIP push; report and end at once.
            let uuid = ringIds[ringId] ?? UUID()
            let update = CXCallUpdate()
            update.remoteHandle = CXHandle(type: .generic, value: data["conversationId"] ?? "kidease")
            provider?.reportNewIncomingCall(with: uuid, update: update) { _ in
                self.provider?.reportCall(with: uuid, endedAt: nil, reason: .remoteEnded)
                completion()
            }
            ringIds[ringId] = nil
            calls[uuid] = nil
            return
        }
        let uuid = UUID()
        calls[uuid] = data
        ringIds[ringId] = uuid
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: data["conversationId"] ?? "kidease")
        update.localizedCallerName = data["callerName"] ?? "KidEase"
        update.hasVideo = data["media"] == "video"
        provider?.reportNewIncomingCall(with: uuid, update: update) { _ in completion() }
        // Ring window: 25 s, then report unanswered.
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            guard let self = self, self.calls[uuid] != nil else { return }
            self.provider?.reportCall(with: uuid, endedAt: nil, reason: .unanswered)
            self.calls[uuid] = nil
            self.notifyListeners("callTimeout", data: ["ringId": ringId])
        }
    }

    public func providerDidReset(_ provider: CXProvider) { calls.removeAll(); ringIds.removeAll() }

    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let data = calls[action.callUUID] ?? [:]
        calls[action.callUUID] = nil
        action.fulfill()
        // Hand the call to the in-app Twilio room; CallKit only rang.
        provider.reportCall(with: action.callUUID, endedAt: nil, reason: .answeredElsewhere)
        notifyListeners("callAnswered", data: data, retainUntilConsumed: true)
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let data = calls[action.callUUID] ?? [:]
        calls[action.callUUID] = nil
        action.fulfill()
        if !data.isEmpty { notifyListeners("callDeclined", data: data, retainUntilConsumed: true) }
    }
}
