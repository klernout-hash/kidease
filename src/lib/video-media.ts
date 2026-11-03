/**
 * Twilio Video mute and camera state.
 * Local tracks must call enable/disable. The remote UI follows
 * track enabled and disabled events, not the button label.
 */

export type MediaKind = "audio" | "video";

export type RemoteMediaState = { audio: boolean; video: boolean };

type TrackLike = {
  kind?: string;
  isEnabled?: boolean;
  enable?: () => void;
  disable?: () => void;
  mediaStreamTrack?: { enabled: boolean };
  on?: (event: string, listener: () => void) => void;
};

type PublicationLike = {
  kind?: string;
  isTrackEnabled?: boolean;
  track?: TrackLike | null;
  on?: (event: string, listener: () => void) => void;
};

type ParticipantLike = {
  tracks?: { forEach: (fn: (publication: PublicationLike) => void) => void };
  on?: (event: string, listener: (track: TrackLike) => void) => void;
};

type LocalParticipantLike = {
  audioTracks?: { forEach: (fn: (publication: PublicationLike) => void) => void };
  videoTracks?: { forEach: (fn: (publication: PublicationLike) => void) => void };
};

function pubs(participant: LocalParticipantLike, kind: MediaKind) {
  return kind === "audio" ? participant.audioTracks : participant.videoTracks;
}

/** Turn a local Twilio track on or off. Returns how many tracks changed. */
export function setLocalTracksEnabled(
  participant: LocalParticipantLike | null | undefined,
  kind: MediaKind,
  enabled: boolean,
): number {
  const map = pubs(participant ?? {}, kind);
  if (!map) return 0;
  let changed = 0;
  map.forEach((publication) => {
    const track = publication.track;
    if (!track) return;
    if (enabled) track.enable?.();
    else track.disable?.();
    if (track.mediaStreamTrack) track.mediaStreamTrack.enabled = enabled;
    changed += 1;
  });
  return changed;
}

export function publicationEnabled(publication: PublicationLike): boolean {
  if (typeof publication.isTrackEnabled === "boolean") return publication.isTrackEnabled;
  if (publication.track && typeof publication.track.isEnabled === "boolean") return publication.track.isEnabled;
  return true;
}

function applyKind(state: RemoteMediaState, kind: string | undefined, enabled: boolean): RemoteMediaState {
  if (kind !== "audio" && kind !== "video") return state;
  return { ...state, [kind]: enabled };
}

/**
 * Keep a remote participant's mute and camera state in sync with Twilio.
 * Listens on the participant and on each publication and track.
 */
export function bindRemoteMedia(
  participant: ParticipantLike,
  onChange: (state: RemoteMediaState) => void,
): () => void {
  let state: RemoteMediaState = { audio: true, video: true };
  const emit = (next: RemoteMediaState) => {
    state = next;
    onChange(state);
  };
  const fromPublication = (publication: PublicationLike) => {
    emit(applyKind(state, publication.kind, publicationEnabled(publication)));
  };
  const fromTrack = (track: TrackLike) => {
    const enabled = track.isEnabled !== false;
    emit(applyKind(state, track.kind, enabled));
  };
  participant.tracks?.forEach((publication) => {
    publication.on?.("trackEnabled", () => fromPublication({ ...publication, isTrackEnabled: true }));
    publication.on?.("trackDisabled", () => fromPublication({ ...publication, isTrackEnabled: false }));
    publication.track?.on?.("enabled", () => fromTrack({ ...publication.track, kind: publication.kind, isEnabled: true }));
    publication.track?.on?.("disabled", () => fromTrack({ ...publication.track, kind: publication.kind, isEnabled: false }));
    fromPublication(publication);
  });
  participant.on?.("trackSubscribed", (track) => {
    track.on?.("enabled", () => fromTrack({ ...track, isEnabled: true }));
    track.on?.("disabled", () => fromTrack({ ...track, isEnabled: false }));
    fromTrack(track);
  });
  participant.on?.("trackEnabled", (track) => fromTrack({ ...track, isEnabled: true }));
  participant.on?.("trackDisabled", (track) => fromTrack({ ...track, isEnabled: false }));
  return () => undefined;
}
