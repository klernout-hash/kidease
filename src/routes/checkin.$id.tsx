import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { getDaycare } from "@/lib/server/daycares";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/checkin/$id")({ component: CheckIn });

function CheckIn() {
  const { id } = Route.useParams();
  const { t, locale } = useCopy();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("/photos/playroom.jpg");
  const [muted, setMuted] = useState(false);
  const [cam, setCam] = useState(true);

  useEffect(() => {
    void getDaycare({ data: id }).then((res) => {
      if (!res) return;
      setName(locale === "fr" ? res.daycare.nameFr : res.daycare.name);
      setPhoto(res.daycare.photos[1] ?? res.daycare.photos[0] ?? "/photos/playroom.jpg");
    });
  }, [id, locale]);

  useEffect(() => {
    let live = true;
    void navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (!live) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => undefined);
    return () => {
      live = false;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((tr) => {
      tr.enabled = !next;
    });
  }

  function toggleCam() {
    const next = !cam;
    setCam(next);
    streamRef.current?.getVideoTracks().forEach((tr) => {
      tr.enabled = next;
    });
  }

  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Link to="/daycare/$slug" params={{ slug: id }} className="text-sm text-muted">
          ← {name || t("back")}
        </Link>
        <h1 className="mt-2 font-display text-3xl">{t("checkInTitle")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">{t("checkInLead")}</p>
        <div className="relative mt-6 overflow-hidden rounded-xl bg-fg">
          <img src={photo} alt="" className="aspect-video w-full object-cover opacity-90" />
          <p className="absolute left-3 top-3 rounded-full bg-bg/90 px-3 py-1 text-xs">{name} · room overview</p>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute bottom-3 right-3 h-28 w-40 rounded-md object-cover ring-1 ring-border"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={toggleMute}>
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            {t("mute")}
          </Button>
          <Button variant="secondary" onClick={toggleCam}>
            {cam ? <Video className="size-4" /> : <VideoOff className="size-4" />}
            {t("camera")}
          </Button>
          <Button variant="danger" asChild>
            <Link to="/daycare/$slug" params={{ slug: id }}>
              {t("end")}
            </Link>
          </Button>
        </div>
      </main>
    </Shell>
  );
}
