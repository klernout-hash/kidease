import { registerPlugin } from "@capacitor/core";

export type PasskeyNativePlugin = {
  create(options: { requestJson: string }): Promise<{ responseJson: string }>;
  get(options: { requestJson: string }): Promise<{ responseJson: string }>;
};

/**
 * Android Credential Manager. Used only when the Capacitor WebView has no
 * WebAuthn API. Play and Samsung ship Play Services. Huawei uses the
 * platform Credential Manager (Android 14+) and otherwise keeps email sign-in.
 */
export const PasskeyNative = registerPlugin<PasskeyNativePlugin>("Passkey");
