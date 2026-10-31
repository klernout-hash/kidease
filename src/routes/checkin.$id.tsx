import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { doorCopy, doorStatus, todayYmd } from "@/lib/attendance-door";
import { localePath } from "@/lib/locale-path";
import { digitalAttendanceFlag } from "@/lib/server/attendance-flag";
import { getDaycare } from "@/lib/server/daycares";
import { saveAttendance } from "@/lib/server/ops";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/checkin/$id")({ component: CheckInGate });

function CheckInGate() {
  const [door, setDoor] = useState<boolean | null>(null);
  useEffect(() => {
    void digitalAttendanceFlag()
      .then((on) => setDoor(Boolean(on)))
      .catch(() => setDoor(false));
  }, []);
  if (door === null) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto w-full max-w-lg py-8">
          <p className="text-sm font-semibold text-primary">KidEase</p>
          <p className="mt-3 text-muted">Opening check-in.</p>
          <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
            Home
          </Link>
        </main>
      </Shell>
    );
  }
  if (door) return <DoorCheckIn />;
  return <CameraCheckIn />;
}

function DoorCheckIn() {
  const { id } = Route.useParams();
  const { locale } = useCopy();
  const copy = doorCopy(locale === "fr" ? "fr" : "en");
  const [daycareId, setDaycareId] = useState("");
  const [centre, setCentre] = useState("");
  const [child, setChild] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getDaycare({ data: id }).then((res) => {
      if (!res) return;
      setDaycareId(res.daycare.id);
      setCentre(locale === "fr" ? res.daycare.nameFr : res.daycare.name);
    });
  }, [id, locale]);

  async function mark(action: "check_in" | "check_out") {
    const name = child.trim();
    if (!name || !daycareId) {
      setMessage(copy.needName);
      return;
    }
    try {
      await saveAttendance({
        data: {
          daycareId,
          childName: name,
          day: todayYmd(),
          dropOff: "07:30",
          pickUp: "17:00",
          status: doorStatus(action),
        },
      });
      setMessage(copy.saved);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : copy.needName);
    }
  }

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-8" data-ke="door-checkin">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{copy.title}</h1>
        <p className="mt-3 text-muted">{centre}</p>
        <p className="mt-2 text-muted">{copy.lead}</p>
        <label className="mt-6 block text-sm">
          {copy.child}
          <input
            className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
            value={child}
            maxLength={80}
            autoComplete="given-name"
            onChange={(event) => setChild(event.target.value)}
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={() => void mark("check_in")}>
            {copy.in}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void mark("check_out")}>
            {copy.out}
          </Button>
        </div>
        {message ? (
          <p className="mt-3 text-sm" role="status">
            {message}
          </p>
        ) : null}
        <Link
          to={localePath("/help", locale)}
          className="mt-4 inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {copy.help}
        </Link>
      </main>
    </Shell>
  );
}

function CameraCheckIn() {
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
