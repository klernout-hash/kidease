import { useEffect, useState } from "react";
import { expiryStatusLine } from "@/lib/background-check-guide";
import { loadPublicBackgroundCheckLine } from "@/lib/server/background-check-records";
import { attestationLine } from "@/lib/background-check-guide";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";

type Line = {
  show: boolean;
  lineEn?: string | null;
  lineFr?: string | null;
  expiryStatus?: "expired" | "due_soon" | "current" | null;
};

export function BackgroundCheckAttestation({
  daycareId,
  locale,
}: {
  daycareId: string;
  locale: "en" | "fr";
}) {
  const [line, setLine] = useState<Line | null>(null);
  useEffect(() => {
    let live = true;
    void loadPublicBackgroundCheckLine({ data: daycareId })
      .then((next) => {
        if (live) setLine(next);
      })
      .catch(() => {
        if (live) setLine({ show: false });
      });
    return () => {
      live = false;
    };
  }, [daycareId]);
  if (!line?.show) return null;
  const text = locale === "fr" ? line.lineFr : line.lineEn;
  if (!text) return null;
  const expiry = line.expiryStatus ? expiryStatusLine(line.expiryStatus, locale) : null;
  return (
    <p className="mt-3 text-sm leading-6 text-muted" data-ke="bg-check-attestation">
      {text}
      {expiry ? <span className="mt-1 block">{expiry}</span> : null}
    </p>
  );
}

export function BackgroundCheckAttestationSample({ locale }: { locale: "en" | "fr" }) {
  const place = START_DAYCARE_PTS.find((row) => row.code === "ON");
  const name = locale === "fr" ? place?.nameFr ?? "Ontario" : place?.nameEn ?? "Ontario";
  const when = locale === "fr" ? "22 novembre 2026" : "22 November 2026";
  return (
    <p className="mt-3 text-sm leading-6" data-ke="bg-check-attestation">
      {attestationLine({ provinceName: name, asOf: when, locale })}
    </p>
  );
}
