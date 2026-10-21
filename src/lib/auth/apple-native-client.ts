import { registerPlugin } from "@capacitor/core";

export type AppleNativeSheetResult = {
  identityToken: string;
  authorizationCode?: string | null;
  email?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  user?: string | null;
};

type AppleSignInPlugin = {
  authorize(options: { nonce: string }): Promise<AppleNativeSheetResult>;
};

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

/** System Sign in with Apple sheet. iOS only. Nonce is the SHA-256 hex. */
export async function authorizeNativeApple(hashedNonce: string): Promise<AppleNativeSheetResult> {
  const result = await AppleSignIn.authorize({ nonce: hashedNonce });
  if (!result?.identityToken?.trim()) throw new Error("Apple did not return an identity token");
  return result;
}
