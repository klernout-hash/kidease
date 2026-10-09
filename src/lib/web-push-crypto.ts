/**
 * VAPID (RFC 8292) and Web Push aes128gcm (RFC 8291).
 * Node crypto only. No vendor SDK. Secrets stay in the arguments, never logs.
 *
 * scripts/web-push.test.mjs round-trips a payload with a subscriber key.
 */

import { createCipheriv, createDecipheriv, createECDH, createPrivateKey, createPublicKey, hkdfSync, randomBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { signJwt } from "./server/push-send.ts";

/** PKCS#8 for a raw 32-byte P-256 scalar. Lengths stay under 128, so DER uses the short form. */
function p256PrivatePkcs8(raw: Buffer): Buffer {
  const version = Buffer.from([0x02, 0x01, 0x01]);
  const octet = Buffer.concat([Buffer.from([0x04, 0x20]), raw]);
  const curve = Buffer.from("06082a8648ce3d030107", "hex");
  const params = Buffer.concat([Buffer.from([0xa0, curve.length]), curve]);
  const ecBody = Buffer.concat([version, octet, params]);
  const ecPriv = Buffer.concat([Buffer.from([0x30, ecBody.length]), ecBody]);
  const algBody = Buffer.from("06072a8648ce3d020106082a8648ce3d030107", "hex");
  const alg = Buffer.concat([Buffer.from([0x30, algBody.length]), algBody]);
  const info = Buffer.concat([Buffer.from([0x02, 0x01, 0x00]), alg, Buffer.from([0x04, ecPriv.length]), ecPriv]);
  return Buffer.concat([Buffer.from([0x30, info.length]), info]);
}

function uncompressedPoint(key: KeyObject): string {
  const spki = createPublicKey(key).export({ type: "spki", format: "der" });
  const point = Buffer.from(spki).subarray(-65);
  if (point.length !== 65 || point[0] !== 4) throw new Error("VAPID public key could not be derived.");
  return b64urlEncode(point);
}

function b64urlEncode(input: Buffer): string {
  return input.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

export function vapidPrivateToKey(rawOrPem: string): KeyObject {
  const trimmed = rawOrPem.trim().replace(/^["']|["']$/g, "");
  if (trimmed.includes("BEGIN")) {
    return createPrivateKey(trimmed.replace(/\\n/g, "\n"));
  }
  const raw = b64urlDecode(trimmed);
  if (raw.length !== 32) throw new Error("VAPID private key must be 32 bytes or a PEM.");
  return createPrivateKey({ key: p256PrivatePkcs8(raw), format: "der", type: "pkcs8" });
}

/** Uncompressed P-256 point, base64url, no padding. This is the browser applicationServerKey. */
export function vapidPublicRaw(publicOrPrivate: string, privateHint?: string): string {
  const configured = publicOrPrivate.trim();
  if (configured && !configured.includes("BEGIN")) {
    const decoded = b64urlDecode(configured);
    if (decoded.length === 65 && decoded[0] === 4) return b64urlEncode(decoded);
  }
  return uncompressedPoint(vapidPrivateToKey(privateHint || configured));
}

export function vapidKeysMatch(publicKey: string, privateKey: string): boolean {
  try {
    return vapidPublicRaw(publicKey) === vapidPublicRaw("", privateKey);
  } catch {
    return false;
  }
}

export function vapidAuthorization(input: {
  endpoint: string;
  publicKey: string;
  privateKey: string;
  subject: string;
  nowSec: number;
}): string {
  const origin = new URL(input.endpoint).origin;
  const pub = vapidPublicRaw(input.publicKey, input.privateKey);
  const pem = vapidPrivateToKey(input.privateKey).export({ type: "pkcs8", format: "pem" });
  const pemText = typeof pem === "string" ? pem : pem.toString();
  const jwt = signJwt(
    { typ: "JWT", alg: "ES256" },
    { aud: origin, exp: input.nowSec + 12 * 60 * 60, sub: input.subject },
    pemText,
    "ES256",
  );
  return `vapid t=${jwt}, k=${pub}`;
}

export function encryptWebPushPayload(input: {
  payload: string;
  p256dh: string;
  auth: string;
  localPublicKey?: Buffer;
  localPrivate?: ReturnType<typeof createECDH>;
  salt?: Buffer;
}): Buffer {
  const userPublic = b64urlDecode(input.p256dh.trim());
  const auth = b64urlDecode(input.auth.trim());
  if (userPublic.length !== 65 || userPublic[0] !== 4) throw new Error("Bad p256dh key.");
  if (auth.length < 16) throw new Error("Bad auth secret.");

  const local = input.localPrivate ?? createECDH("prime256v1");
  if (!input.localPrivate) local.generateKeys();
  const localPublic = input.localPublicKey ?? local.getPublicKey();
  const shared = local.computeSecret(userPublic);
  const salt = input.salt ?? randomBytes(16);
  const ikm = hkdf(
    shared,
    auth,
    Buffer.concat([Buffer.from("WebPush: info\0"), userPublic, localPublic]),
    32,
  );
  const key = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(input.payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([localPublic.length]), localPublic, body]);
}

/** Test helper. Subscriber private key decrypts a record this module encrypted. */
export function decryptWebPushPayload(record: Buffer, subscriber: ReturnType<typeof createECDH>, auth: string): string {
  const salt = record.subarray(0, 16);
  const idLen = record[20] ?? 0;
  const senderPublic = record.subarray(21, 21 + idLen);
  const ciphertext = record.subarray(21 + idLen);
  const userPublic = subscriber.getPublicKey();
  const shared = subscriber.computeSecret(senderPublic);
  const ikm = hkdf(
    shared,
    b64urlDecode(auth),
    Buffer.concat([Buffer.from("WebPush: info\0"), userPublic, senderPublic]),
    32,
  );
  const key = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  const mark = plain.lastIndexOf(2);
  if (mark < 0) throw new Error("Missing padding delimiter.");
  return plain.subarray(0, mark).toString("utf8");
}
