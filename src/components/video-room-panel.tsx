import { useEffect, useRef, useState } from "react";
import { createCallRinger } from "@/lib/call-ring-client";
import type { LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack, RemoteParticipant, RemoteVideoTrack, Room } from "twilio-video";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { bindRemoteMedia, setLocalTracksEnabled, type RemoteMediaState } from "@/lib/video-media";

type MediaTrack = RemoteAudioTrack | RemoteVideoTrack | LocalAudioTrack | LocalVideoTrack;

function isMediaTrack(track: { kind: string }): track is MediaTrack {
  return track.kind === "audio" || track.kind === "video";
}

function attachTrack(track: { kind: string }, host: HTMLElement, local: boolean) {
  if (!isMediaTrack(track)) return;
  const el = track.attach();
  if (el instanceof HTMLVideoElement) {
    el.playsInline = true;
    el.autoplay = true;
    el.muted = local;
    el.className = local ? "ke-video-self h-full w-full object-cover" : "h-full w-full object-cover";
  }
  if (el instanceof HTMLAudioElement) el.autoplay = true;
  host.appendChild(el);
}

function clearHost(host: HTMLElement | null) {
  if (!host) return;
  host.replaceChildren();
}

function showRemote(participant: RemoteParticipant, host: HTMLElement) {
  participant.tracks.forEach((publication) => {
    if (publication.track && isMediaTrack(publication.track)) attachTrack(publication.track, host, false);
  });
  participant.on("trackSubscribed", (track) => {
    if (isMediaTrack(track)) attachTrack(track, host, false);
  });
}

/**
 * Joins one Twilio Video room. The token is used only to connect.
 * It is not written into the page text.
 */
export function VideoRoomPanel({
  token,
  roomName,
  onLeft,
}: {
  token: string;
  roomName: string;
  onLeft: () => void;
}) {
  const { t } = useCopy();
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const ringerRef = useRef<ReturnType<typeof createCallRinger> | null>(null);
  const [phase, setPhase] = useState<"joining" | "waiting" | "live" | "error">("joining");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<RemoteMediaState>({ audio: true, video: true });

  useEffect(() => {
    const stage = remoteRef.current?.closest("[data-ke='video-room']");
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      stage.setAttribute("data-ke-fit", "live");
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Room connect depends on the token only. A fold or Split View resize
  // must not re-run this effect, or the call would disconnect.
  useEffect(() => {
    let cancelled = false;
    const localHost = localRef.current;
    const remoteHost = remoteRef.current;
    // Background ring (FEATURE_CALL_PUSH, off): ring the other side if no one is here yet.
    const ringer = createCallRinger(roomName, "video");
    ringerRef.current = ringer;
    void (async () => {
      try {
        const mod = await import("twilio-video");
        // twilio-video is CommonJS; in the production bundle connect() sits on .default.
        const sdk = (typeof (mod as { connect?: unknown }).connect === "function"
          ? mod
          : (mod as unknown as { default: typeof mod }).default) as typeof mod;
        const opts = { name: roomName, audio: true, video: { width: 640, height: 480, frameRate: 24 } as false | { width: number; height: number; frameRate: number } };
        let room: Room;
        try {
          room = await sdk.connect(token, opts);
        } catch (first) {
          const n = (first as { name?: string })?.name || "";
          // Camera blocked or missing: join with audio only instead of failing the call.
          if (!/NotAllowed|NotFound|NotReadable|Overconstrained/i.test(n)) throw first;
          room = await sdk.connect(token, { ...opts, video: false });
        }
        if (cancelled) {
          room.disconnect();
          return;
        }
        roomRef.current = room;
        if (localHost) {
          room.localParticipant.tracks.forEach((publication) => {
            if (isMediaTrack(publication.track)) attachTrack(publication.track, localHost, true);
          });
        }
        const paint = (participant: RemoteParticipant) => {
          if (!remoteHost) return;
          clearHost(remoteHost);
          showRemote(participant, remoteHost);
          bindRemoteMedia(participant, setRemoteMedia);
          ringer.end("answered");
          setPhase("live");
        };
        room.participants.forEach(paint);
        room.on("participantConnected", paint);
        room.on("participantDisconnected", () => {
          clearHost(remoteHost);
          setPhase("waiting");
        });
        if (!cancelled) setPhase(room.participants.size ? "live" : "waiting");
        if (!cancelled && !room.participants.size) void ringer.start();
      } catch (err) {
        const e = err as { code?: number; name?: string };
        const tag = e?.code ? String(e.code) : e?.name || "";
        console.warn("[kidease-video] connect failed", tag, (err as Error)?.message);
        if (!cancelled) {
          setPhase("error");
          setNote(tag ? `${t("videoTourFailed")} (${tag})` : t("videoTourFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
      ringer.end("hangup");
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.localParticipant.tracks.forEach((publication) => {
          if (isMediaTrack(publication.track)) publication.track.stop();
        });
        room.disconnect();
      }
      clearHost(localHost);
      clearHost(remoteHost);
    };
  }, [roomName, t, token]);

  function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    const changed = setLocalTracksEnabled(room.localParticipant, "audio", !next);
    if (changed > 0) setMuted(next);
  }

  function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOff;
    const changed = setLocalTracksEnabled(room.localParticipant, "video", !next);
    if (changed > 0) setCameraOff(next);
  }

  function leave() {
    ringerRef.current?.end("hangup");
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.localParticipant.tracks.forEach((publication) => {
        if (isMediaTrack(publication.track)) publication.track.stop();
      });
      room.disconnect();
    }
    onLeft();
  }

  const status =
    phase === "joining" ? t("loading") : phase === "live" ? t("videoInCall") : phase === "waiting" ? t("videoWaitingRoom") : note;

  return (
    <div className="ke-video-room mt-6" data-ke="video-room" data-ke-live="video">
      <div className="ke-video-stage relative overflow-hidden rounded-2xl bg-fg/5 ring-1 ring-border">
        <div
          ref={remoteRef}
          className="aspect-video w-full min-h-0 bg-fg/10 [[data-channel=app]_&]:bg-[#141820]"
          aria-label={t("videoInCall")}
          data-remote-audio={remoteMedia.audio ? "on" : "off"}
          data-remote-video={remoteMedia.video ? "on" : "off"}
        />
        {!remoteMedia.video || !remoteMedia.audio ? (
          <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-fg/80 px-3 py-2 text-sm font-medium text-bg" role="status">
            {!remoteMedia.video ? t("videoCamOff") : null}
            {!remoteMedia.video && !remoteMedia.audio ? " · " : null}
            {!remoteMedia.audio ? t("voiceMute") : null}
          </p>
        ) : null}
        <div
          ref={localRef}
          className="absolute bottom-3 right-3 aspect-video w-[28%] overflow-hidden rounded-xl bg-fg/20 ring-1 ring-border [[data-channel=app]_&]:max-h-[40%] [[data-channel=app]_&]:w-[clamp(5.5rem,28%,9rem)]"
          aria-label={t("camera")}
        />
      </div>
      <div className="min-w-0">
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      <p className="text-sm text-muted">{status}</p>
      {phase === "error" ? <p className="mt-2 text-sm text-danger">{note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="danger" className="min-w-11" onClick={leave}>
          {t("videoLeave")}
        </Button>
        <Button type="button" variant="secondary" className="min-w-11" onClick={toggleMute} disabled={phase === "joining" || phase === "error"}>
          {muted ? t("voiceUnmute") : t("voiceMute")}
        </Button>
        <Button type="button" variant="secondary" className="min-w-11" onClick={toggleCamera} disabled={phase === "joining" || phase === "error"}>
          {cameraOff ? t("videoCamOn") : t("videoCamOff")}
        </Button>
      </div>
      </div>
    </div>
  );
}
