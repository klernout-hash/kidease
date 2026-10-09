import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

const POSTER = "/video/how-kidease.webp";
const MP4 = "/video/how-kidease.mp4";
const DESKTOP_QUERY = "(min-width: 1024px)";

function desktopWebsite() {
  if (typeof window === "undefined") return false;
  const runtime = document.documentElement.dataset.runtime;
  if (runtime === "ios" || runtime === "android") return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function isPlaybackBlock(error: unknown) {
  return !(error instanceof DOMException && error.name === "AbortError");
}

/**
 * Desktop website explainer. Phones and the native shells never request the
 * file. On a wide website, the file waits until this block is near the viewport.
 *
 * Each scroll-into-view tries to play with sound, unless the visitor muted it
 * earlier in this visit. Many browsers block unmuted autoplay until a tap.
 * If play() rejects, playback stops and a "Play with sound" button is the
 * next step. We do not fall back to a silent loop that never offers sound.
 */
export function HomeHowVideo() {
  const { t } = useCopy();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userMutedRef = useRef(false);
  const armGesture = useRef(false);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [seenRatio, setSeenRatio] = useState(0);
  const [tabVisible, setTabVisible] = useState(true);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [userMuted, setUserMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [srcOn, setSrcOn] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    userMutedRef.current = userMuted;
  }, [userMuted]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => {
      const on = desktopWebsite();
      setDesktop(on);
      if (!on) {
        setNear(false);
        setOnScreen(false);
        setSeenRatio(0);
        setSrcOn(false);
        setStarted(false);
        setPlaying(false);
        setSoundBlocked(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    const el = rootRef.current;
    if (!el || el.getClientRects().length === 0) return;
    const nearIo = new IntersectionObserver(
      ([entry]) => setNear(Boolean(entry?.isIntersecting)),
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );
    const playIo = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        setSeenRatio(ratio);
        setOnScreen(ratio >= 0.35);
      },
      { root: null, rootMargin: "0px", threshold: [0, 0.15, 0.35] },
    );
    nearIo.observe(el);
    playIo.observe(el);
    return () => {
      nearIo.disconnect();
      playIo.disconnect();
    };
  }, [desktop]);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (seenRatio > 0) return;
    setUserPaused(false);
    setSoundBlocked(false);
  }, [seenRatio]);

  const showPoster = desktop && (near || started) && reduced !== null;
  const showVideo = desktop && reduced !== null && (started || near);
  const shouldPlay =
    showVideo &&
    tabVisible &&
    onScreen &&
    !userPaused &&
    !soundBlocked &&
    (reduced === false || started);

  useEffect(() => {
    if (!desktop) return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    if ((shouldPlay || started || near) && reduced !== null) setSrcOn(true);
  }, [desktop, shouldPlay, started, near, reduced]);

  const beginPlayback = useCallback((video: HTMLVideoElement) => {
    const wantSound = !userMutedRef.current;
    video.muted = !wantSound;
    const pending = video.play();
    if (!pending) return;
    pending
      .then(() => {
        if (wantSound && video.muted) {
          video.pause();
          setPlaying(false);
          setSoundBlocked(true);
          return;
        }
        setSoundBlocked(false);
        setPlaying(!video.paused);
      })
      .catch((error: unknown) => {
        if (!isPlaybackBlock(error)) return;
        video.pause();
        setPlaying(false);
        setSoundBlocked(true);
      });
  }, []);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || !armGesture.current) return;
    armGesture.current = false;
    beginPlayback(video);
  }, [srcOn, beginPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      video.pause();
      setPlaying(false);
      return;
    }
    let cancelled = false;
    const wantSound = !userMutedRef.current;
    video.muted = !wantSound;
    const pending = video.play();
    if (pending) {
      pending
        .then(() => {
          if (cancelled) return;
          if (wantSound && video.muted) {
            video.pause();
            setPlaying(false);
            setSoundBlocked(true);
            return;
          }
          setSoundBlocked(false);
          setPlaying(!video.paused);
        })
        .catch((error: unknown) => {
          if (cancelled || !isPlaybackBlock(error)) return;
          video.pause();
          setPlaying(false);
          setSoundBlocked(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [shouldPlay, userMuted, srcOn]);

  function playFromUser() {
    setUserPaused(false);
    setSoundBlocked(false);
    setStarted(true);
    const video = videoRef.current;
    if (!video) {
      armGesture.current = true;
      return;
    }
    beginPlayback(video);
  }

  function pauseFromUser() {
    setUserPaused(true);
    setPlaying(false);
    videoRef.current?.pause();
  }

  function toggleMute() {
    const next = !userMutedRef.current;
    userMutedRef.current = next;
    setUserMuted(next);
    const video = videoRef.current;
    if (!video) return;
    video.muted = next;
    if (next || !video.paused) return;
    setUserPaused(false);
    setSoundBlocked(false);
    setStarted(true);
    beginPlayback(video);
  }

  const showCenterPlay = Boolean(
    showPoster &&
      !playing &&
      !shouldPlay &&
      (soundBlocked || userPaused || reduced === true || seenRatio > 0),
  );
  const wantSound = !userMuted;
  const controlClass =
    "pointer-events-auto size-11 min-h-11 min-w-11 border-0 bg-black/75 text-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] hover:bg-black/85 focus-visible:ring-white";

  return (
    <div
      ref={rootRef}
      data-ke="home-how-video"
      data-sound={userMuted ? "off" : "on"}
      data-playback={soundBlocked ? "needs-gesture" : playing ? "playing" : "paused"}
      className="ke-how-video mx-auto mt-6 w-full max-w-[720px]"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-surface">
        {showPoster && !srcOn ? (
          <img
            src={POSTER}
            alt=""
            width={960}
            height={540}
            decoding="async"
            fetchPriority="low"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {srcOn ? (
          <video
            ref={videoRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            poster={POSTER}
            preload="none"
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            width={1280}
            height={720}
            aria-hidden="true"
            onPlay={() => {
              const video = videoRef.current;
              if (!video || video.paused) return;
              setPlaying(true);
            }}
            onPause={() => {
              const video = videoRef.current;
              if (video && !video.paused) return;
              setPlaying(false);
            }}
          >
            <source src={MP4} type="video/mp4" />
          </video>
        ) : null}
        {showPoster ? (
          <div className="pointer-events-none absolute inset-0">
            {showCenterPlay ? (
              <div className="absolute inset-0 grid place-items-center p-4">
                <Button
                  type="button"
                  size={wantSound ? "md" : "icon"}
                  variant="secondary"
                  className={
                    wantSound
                      ? "pointer-events-auto h-11 min-h-11 border-0 bg-black/75 px-4 text-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] hover:bg-black/85 focus-visible:ring-white"
                      : controlClass
                  }
                  aria-label={wantSound ? t("howVideoPlayWithSound") : t("howVideoPlay")}
                  onClick={(event) => {
                    event.stopPropagation();
                    playFromUser();
                  }}
                >
                  {wantSound ? (
                    <>
                      <Volume2 className="size-5 shrink-0" aria-hidden="true" />
                      {t("howVideoPlayWithSound")}
                    </>
                  ) : (
                    <Play className="size-5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3">
              {playing ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className={controlClass}
                  aria-label={t("howVideoPause")}
                  onClick={(event) => {
                    event.stopPropagation();
                    pauseFromUser();
                  }}
                >
                  <Pause className="size-5" aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className={controlClass}
                aria-pressed={!userMuted}
                aria-label={userMuted ? t("howVideoSoundOn") : t("howVideoSoundOff")}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleMute();
                }}
              >
                {userMuted ? (
                  <VolumeX className="size-5" aria-hidden="true" />
                ) : (
                  <Volume2 className="size-5" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
