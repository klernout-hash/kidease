/**
 * Ask for the camera and microphone on the tap that starts a call.
 * iPad shows the system prompt from that gesture. Tracks are stopped
 * so Twilio can open its own stream after the person has allowed access.
 */
export async function primeCallMedia(kind: "audio" | "video"): Promise<"ok" | "denied" | "unavailable"> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unavailable";
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "video" ? { audio: true, video: true } : { audio: true },
    );
    for (const track of stream.getTracks()) track.stop();
    return "ok";
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    return "unavailable";
  }
}
