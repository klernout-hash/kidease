/**
 * Sign in with Apple route choice.
 * The login button stays hidden until APPLE_* is set (see providers.ts).
 * iOS native uses the system sheet. Everywhere else uses the web redirect.
 */

export type AppleSignInRoute = "hidden" | "web" | "native";

export function appleSignInRoute(input: {
  configured: boolean;
  native: boolean;
  platform: "ios" | "android" | "web";
}): AppleSignInRoute {
  if (!input.configured) return "hidden";
  if (input.native && input.platform === "ios") return "native";
  return "web";
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Raw nonce goes to Better Auth. Apple's sheet receives the SHA-256 hex. */
export async function appleNoncePair(): Promise<{ raw: string; hashed: string }> {
  const raw = crypto.randomUUID();
  return { raw, hashed: await sha256Hex(raw) };
}

export type AppleNativeCredential = {
  identityToken: string;
  authorizationCode?: string | null;
};

/** Payload for authClient.signIn.social. Nonce is the raw value, not the hash. */
export function appleNativeIdToken(input: { credential: AppleNativeCredential; rawNonce: string }) {
  const token = input.credential.identityToken.trim();
  if (!token) throw new Error("Apple did not return an identity token");
  return {
    provider: "apple" as const,
    idToken: {
      token,
      nonce: input.rawNonce,
    },
  };
}
