import { useEffect, useRef, useState } from "react";
import type { LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack, RemoteParticipant, RemoteVideoTrack, Room } from "twilio-video";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

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
    el.className = "h-full w-full object-cover";
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
  const [phase, setPhase] = useState<"joining" | "waiting" | "live" | "error">("joining");
  const [note, setNote] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const localHost = localRef.current;
    const remoteHost = remoteRef.current;
    void (async () => {
      try {
        const sdk = await import("twilio-video");
        const room = await sdk.connect(token, {
          name: roomName,
          audio: true,
          video: { width: 640, height: 480, frameRate: 24 },
        });
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
          setPhase("live");
        };
        room.participants.forEach(paint);
        room.on("participantConnected", paint);
        room.on("participantDisconnected", () => {
          clearHost(remoteHost);
          setPhase("waiting");
        });
        if (!cancelled) setPhase(room.participants.size ? "live" : "waiting");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setNote(t("videoTourFailed"));
        }
      }
    })();
    return () => {
      cancelled = true;
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
    room.localParticipant.audioTracks.forEach((publication) => {
      if (next) publication.track.disable();
      else publication.track.enable();
    });
    setMuted(next);
  }

  function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    const next = !cameraOff;
    room.localParticipant.videoTracks.forEach((publication) => {
      if (next) publication.track.disable();
      else publication.track.enable();
    });
    setCameraOff(next);
  }

  function leave() {
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
    <div className="ke-video-room mt-6" data-ke="video-room">
      <div className="ke-video-stage relative overflow-hidden rounded-2xl bg-fg/5 ring-1 ring-border">
        <div ref={remoteRef} className="aspect-video w-full bg-fg/10" aria-label={t("videoInCall")} />
        <div
          ref={localRef}
          className="absolute bottom-3 right-3 aspect-video w-[28%] overflow-hidden rounded-xl bg-fg/20 ring-1 ring-border"
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
