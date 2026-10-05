import { useEffect, useId, useRef, useState } from "react";
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

/**
 * Desktop website explainer. Phones and the native shells never request the
 * file. On a wide website, the file waits until this block is near the viewport.
 */
export function HomeHowVideo() {
  const { t } = useCopy();
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [started, setStarted] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [srcOn, setSrcOn] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = () => {
      const on = desktopWebsite();
      setDesktop(on);
      if (!on) {
        setNear(false);
        setOnScreen(false);
        setSrcOn(false);
        setStarted(false);
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
        setOnScreen(entry.isIntersecting && entry.intersectionRatio >= 0.35);
      },
      { root: null, rootMargin: "0px", threshold: [0, 0.35] },
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

  const showPoster = desktop && (near || started) && reduced !== null;
  const showVideo = desktop && (started || (near && reduced === false));
  const shouldPlay = showVideo && tabVisible && onScreen && !userPaused && !blocked;

  useEffect(() => {
    if (!desktop) return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    if ((shouldPlay || started) && reduced !== null) setSrcOn(true);
  }, [desktop, shouldPlay, started, reduced]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    const pending = video.play();
    if (pending) pending.catch(() => setBlocked(true));
  }, [shouldPlay, muted, showVideo, srcOn]);

  function playFromUser() {
    setUserPaused(false);
    setBlocked(false);
    setStarted(true);
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    const pending = video.play();
    if (pending) pending.catch(() => setBlocked(true));
  }

  function pauseFromUser() {
    setUserPaused(true);
    videoRef.current?.pause();
  }

  const showPlay = !shouldPlay;
  const controlClass =
    "pointer-events-auto size-[44px] min-h-[44px] min-w-[44px] border-0 bg-black/60 text-white shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-0 hover:bg-black/75";

  return (
    <section
      ref={rootRef}
      data-ke="home-how-video"
      aria-labelledby={titleId}
      className="ke-how-video ke-gutter mx-auto w-full py-10 md:py-14"
    >
      <div className="mx-auto w-full max-w-[720px]">
        <h2 id={titleId} className="text-center text-xl tracking-[-0.03em] text-fg md:text-2xl">
          {t("howVideoTitle")}
        </h2>
        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-[14px] bg-surface">
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
              muted
              loop
              playsInline
              autoPlay={shouldPlay}
              controls={false}
              disablePictureInPicture
              width={1280}
              height={720}
              aria-hidden="true"
            >
              <source src={MP4} type="video/mp4" />
            </video>
          ) : null}
          {showPoster ? (
            <div className="pointer-events-none absolute inset-0">
              {showPlay ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className={controlClass}
                    aria-label={t("howVideoPlay")}
                    onClick={(event) => {
                      event.stopPropagation();
                      playFromUser();
                    }}
                  >
                    <Play className="size-5" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {showVideo ? (
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3">
                  {showPlay ? null : (
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
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className={controlClass}
                    aria-label={muted ? t("howVideoSoundOn") : t("howVideoSoundOff")}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMuted((value) => !value);
                    }}
                  >
                    {muted ? (
                      <VolumeX className="size-5" aria-hidden="true" />
                    ) : (
                      <Volume2 className="size-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
