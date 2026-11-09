import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useShowPayCtas } from "@/components/pay-chrome";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Globe, MapPin, Megaphone, MessageCircle, Smartphone, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { confirmAction, confirmSuccess } from "@/lib/success-confirm";
import { FeelBanner } from "@/components/building-photo";
import { officialLicenceNumber } from "@/lib/licensing";
import { LISTING_PLACEHOLDER } from "@/lib/listing-photo";
import { isRealListingPhoto } from "@/lib/listing-readiness";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { PROVIDER_TERMS_VERSION } from "@/lib/legal-copy-v2";
import { previewClaimTarget, searchClaimable, saveClaimFees, startClaim, submitEnrollLicense, verifyClaim, type ClaimHit } from "@/lib/server/claims";
import { ClaimVerifyWizard, type ClaimDeliveryView } from "@/components/claim-wizard";
import { isClaimProduction } from "@/lib/claim-contact";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { localePath } from "@/lib/locale-path";
import { MARKETING_PAGE_SEO, pageSeoHead } from "@/lib/page-seo";
import { captureMarketplaceFunnel } from "@/lib/marketplace-funnel";
import { capturePostHogEvent } from "@/lib/posthog";
import { trackProductEvent } from "@/lib/track-product-event";
import { SIGNUP_FUNNEL_EVENT, signupFunnelPayload } from "@/lib/signup-funnel";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import { isListingPhotoTooBig } from "@/lib/upload-limits";

function ClaimHitPhoto({ photo, name, compact = false }: { photo: string; name: string; compact?: boolean }) {
  const size = compact ? 40 : 48;
  const src = isRealListingPhoto(photo) ? photo : LISTING_PLACEHOLDER;
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`mt-0.5 shrink-0 rounded-md object-cover ${compact ? "size-10" : "size-12"}`}
    />
  );
}

export function claimValidateSearch(s: Record<string, unknown>) {
  const q = typeof s.q === "string" ? s.q : "";
  const id = typeof s.id === "string" ? s.id : "";
  const rawPreview = s.preview;
  const preview = typeof rawPreview === "string" ? rawPreview : typeof rawPreview === "number" ? String(rawPreview) : "";
  return {
    ...(q ? { q } : {}),
    ...(id ? { id } : {}),
    ...(preview && !isClaimProduction() ? { preview } : {}),
  };
}

export const Route = createFileRoute("/claim")({
  head: () => pageSeoHead(MARKETING_PAGE_SEO.claim),
  validateSearch: claimValidateSearch,
  component: ClaimRoute,
});

function ClaimRoute() {
  return <ClaimPage search={Route.useSearch()} />;
}

export function ClaimPage({ search }: { search: ReturnType<typeof claimValidateSearch> }) {
  const q0 = search.q ?? "";
  const id0 = search.id ?? "";
  const [selected, setSelected] = useState<{ id: string; name: string; city: string; province: string } | null>(null);
  const [selectedMiss, setSelectedMiss] = useState(false);
  const { t, locale } = useCopy();
  const nativeShell = useInNativeShell();
  const showPayCtas = useShowPayCtas();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [q, setQ] = useState(q0);
  const [hits, setHits] = useState<ClaimHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ daycareId: string; name: string; delivery: ClaimDeliveryView } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [feesNote, setFeesNote] = useState<string | null>(null);
  const [enroll, setEnroll] = useState({ name: "", email: "", centre: "", city: "", phone: "", body: "", daycareId: "" });
  const [enrollLicense, setEnrollLicense] = useState("");
  const [enrollLicenseError, setEnrollLicenseError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollHits, setEnrollHits] = useState<ClaimHit[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollManual, setEnrollManual] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const enrollBox = useRef<HTMLDivElement>(null);
  const enrollFileRef = useRef<HTMLInputElement>(null);
  const claimChallenge = useTurnstileToken();
  const enrollChallenge = useTurnstileToken();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    const tmr = window.setTimeout(() => {
      setBusy(true);
      void searchClaimable({ data: term })
        .then((rows) => {
          setHits(rows);
          setOpen(true);
        })
        .catch(() => {
          setHits([]);
          setOpen(true);
        })
        .finally(() => setBusy(false));
    }, 180);
    return () => window.clearTimeout(tmr);
  }, [q]);

  useEffect(() => {
    if (!id0 || !user) return;
    void begin(id0);
  }, [id0, user]);

  useEffect(() => {
    if (!id0 || user) {
      setSelected(null);
      setSelectedMiss(false);
      return;
    }
    let live = true;
    void previewClaimTarget({ data: id0 })
      .then((row) => {
        if (!live) return;
        setSelected(row);
        setSelectedMiss(!row);
      })
      .catch(() => {
        if (live) setSelectedMiss(true);
      });
    return () => {
      live = false;
    };
  }, [id0, user]);

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    setEnroll((s) => ({
      ...s,
      name: s.name || user.displayName || "",
      email: s.email || user.primaryEmail || "",
    }));
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#enroll") return;
    const el = document.getElementById("enroll");
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    const tmr = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(tmr);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const term = enroll.centre.trim();
    if (enrollManual || term.length < 2) {
      if (term.length < 2) setEnrollHits([]);
      return;
    }
    const tmr = window.setTimeout(() => {
      void searchClaimable({ data: term }).then((rows) => {
        setEnrollHits(rows);
        setEnrollOpen(true);
      });
    }, 180);
    return () => window.clearTimeout(tmr);
  }, [enroll.centre, enrollManual]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!enrollBox.current?.contains(e.target as Node)) setEnrollOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function begin(daycareId: string, name?: string) {
    if (name) setQ(name);
    setOpen(false);
    if (!user) {
      trackProductEvent("claim_started", { source: "claim", surface: "login" });
      capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("claim_started", { source: "claim" }));
      void navigate({
        to: locale === "fr" ? "/fr/login" : "/login",
        search: {
          next: `${localePath("/claim", locale)}?id=${daycareId}`,
          intent: "up",
          role: "provider",
          desk: "provider",
        },
      });
      return;
    }
    setBusy(true);
    try {
      const res = await startClaim({ data: daycareId });
      captureMarketplaceFunnel({ step: "claim", source: "claim", dest_path: "/claim" });
      trackProductEvent("claim_started", { source: "claim", surface: "desk" });
      capturePostHogEvent(SIGNUP_FUNNEL_EVENT, signupFunnelPayload("claim_started", { source: "claim" }));
      if (res.alreadyOwned) {
        confirmSuccess({ variant: "toast", title: t("claimOwned") });
        void navigate({ to: "/provider" });
        return;
      }
      const delivery: ClaimDeliveryView =
        res.delivery === "sent" && res.mask
          ? { kind: "sent", channel: "email", mask: res.mask }
          : { kind: "manual", reason: res.reason || "no_verified_contact" };
      setSubmitted(false);
      setClaimError(null);
      setPending({ daycareId: res.daycareId, name: res.centreName ?? t("provider"), delivery });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("claimFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(input: { code: string; license: string; acceptTerms: boolean }) {
    if (!pending || busy) return;
    if (!input.license.startsWith("data:image") && !input.license.startsWith("data:application/pdf")) {
      setClaimError(t("licensePhoto"));
      return;
    }
    if (!input.acceptTerms) {
      setClaimError(locale === "fr" ? "Acceptez les Conditions des fournisseurs." : "Accept the Provider Terms to continue.");
      return;
    }
    setBusy(true);
    setClaimError(null);
    try {
      await verifyClaim({
        data: {
          acceptTermsVersion: PROVIDER_TERMS_VERSION,
          locale,
          daycareId: pending.daycareId,
          code: input.code,
          licensePhoto: input.license,
          turnstileToken: claimChallenge.token,
        },
      });
      setSubmitted(true);
      confirmAction(t, "claimSubmitted");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("claimFailed");
      setClaimError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveFees(fees: { infantMonthly: string; toddlerMonthly: string; preschoolMonthly: string }) {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await saveClaimFees({
        data: {
          daycareId: pending.daycareId,
          infantMonthly: fees.infantMonthly,
          toddlerMonthly: fees.toddlerMonthly,
          preschoolMonthly: fees.preschoolMonthly,
        },
      });
      setFeesNote(t("claimFeesSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("claimFailed"));
    } finally {
      setBusy(false);
    }
  }

  function rejectLicense(input?: HTMLInputElement | null) {
    const message = t("uploadClaimDocTooBig");
    setEnrollLicenseError(message);
    setEnrollLicense("");
    if (input) input.value = "";
    toast.error(message);
  }

  function readLicense(file: File | undefined, input?: HTMLInputElement | null) {
    if (!file) return;
    if (isListingPhotoTooBig(file.size)) {
      rejectLicense(input);
      return;
    }
    setEnrollLicenseError(null);
    const reader = new FileReader();
    reader.onload = () => setEnrollLicense(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function sendEnroll(e: React.FormEvent) {
    e.preventDefault();
    const picked = enrollFileRef.current?.files?.[0];
    if (picked && isListingPhotoTooBig(picked.size)) {
      rejectLicense(enrollFileRef.current);
      return;
    }
    if (!enrollLicense.startsWith("data:image") && !enrollLicense.startsWith("data:application/pdf")) {
      toast.error(t("licensePhoto"));
      return;
    }
    setEnrollBusy(true);
    try {
      await submitEnrollLicense({
        data: {
          name: enroll.name,
          email: enroll.email,
          centre: enroll.centre,
          city: enroll.city,
          phone: enroll.phone,
          body: enroll.body,
          licensePhoto: enrollLicense,
          daycareId: enroll.daycareId || undefined,
          turnstileToken: enrollChallenge.token,
        },
      });
      confirmAction(t, "applicationSubmitted");
      setEnroll({ name: "", email: "", centre: "", city: "", phone: "", body: "", daycareId: "" });
      setEnrollLicense("");
    } catch {
      toast.error(t("contactSendFailed").replace("{email}", SUPPORT_INBOX_EMAIL));
    } finally {
      setEnrollBusy(false);
    }
  }

  const previewWizard = ((): "pending" | "fees" | 1 | 2 | 3 | null => {
    if (isClaimProduction()) return null;
    const raw = search.preview;
    if (raw === "pending" || raw === "fees") return raw;
    if (raw === "1" || raw === "code") return 1;
    if (raw === "2" || raw === "licence") return 2;
    if (raw === "3" || raw === "terms") return 3;
    return null;
  })();

  const partnerPerks = (
    [
      [Users, "perkParents"],
      [Megaphone, "perkBrand"],
      [Globe, "perkPage"],
      [CalendarCheck, "perkSpots"],
      [MessageCircle, "perkChat"],
      [MapPin, "perkNear"],
      [Smartphone, "perkMobile"],
      [Wallet, "perkPayLive"],
      [TrendingUp, "perkGrow"],
    ] as const
  )
    // In-app payments perk only when SHOW_PAY_CTAS is on (off today) and never in native shells.
    .filter((entry) => !((nativeShell || !showPayCtas) && entry[1] === "perkPayLive"))
    .filter((entry) => !(nativeShell && entry[1] === "perkMobile"));

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-4 py-10" data-ke="claim-page" data-commerce={nativeShell ? "hidden" : "web"}>
        <h1 className="font-display text-4xl">{t("claimFindTitle")}</h1>
        <p className="mt-3 max-w-xl text-muted">{t("claimFindLead")}</p>
        {pending || previewWizard ? (
          <ClaimVerifyWizard
            centreName={pending?.name || (locale === "fr" ? "Centre exemple" : "Example centre")}
            delivery={pending?.delivery || { kind: "manual", reason: "no_verified_contact" }}
            busy={busy}
            error={claimError}
            submitted={submitted}
            feesNote={feesNote}
            startStep={previewWizard || undefined}
            challenge={<TurnstileField onToken={claimChallenge.onToken} />}
            onResend={() => {
              if (pending) void begin(pending.daycareId, pending.name);
            }}
            onSubmit={(input) => void verify(input)}
            onSaveFees={(fees) => void saveFees(fees)}
          />
        ) : (
          <>
            {selected && !user ? (
              <section className="mt-6 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="claim-selected">
                <h2 className="font-display text-2xl">{selected.name}</h2>
                <p className="mt-1 text-sm text-muted">{[selected.city, selected.province].filter(Boolean).join(", ")}</p>
                <Button className="mt-4 min-h-11" type="button" onClick={() => void begin(selected.id, selected.name)}>
                  {t("claimThis")}
                </Button>
              </section>
            ) : null}
            {selectedMiss && !user ? (
              <p className="mt-4 text-sm text-muted" role="status" data-ke="claim-selected-miss">
                {t("claimNoMatch")}
              </p>
            ) : null}
            <div ref={box} className="relative mt-6">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => hits.length > 0 && setOpen(true)}
                placeholder={t("claimSearchPh")}
                autoComplete="off"
                data-ke="claim-find"
                className="h-12 w-full rounded-full bg-surface px-5 shadow-card ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
              />
              {busy && q.trim().length >= 2 ? (
                <p className="absolute right-3 top-3.5 text-xs text-muted">{t("loading")}</p>
              ) : null}
              {open && q.trim().length >= 2 ? (
                <ul className="z-20 mt-2 max-h-[min(60vh,28rem)] w-full overflow-y-auto rounded-xl bg-surface py-1 shadow-card ring-1 ring-border">
                  {hits.length === 0 && !busy ? (
                    <li className="px-4 py-6 text-center text-sm text-muted">{t("claimNoMatch")}</li>
                  ) : (
                    hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          disabled={h.claimed || busy || isPending}
                          onClick={() => void begin(h.id, h.name)}
                          className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-bg disabled:opacity-60"
                        >
                          <ClaimHitPhoto photo={h.photo} name={h.name} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{h.name}</span>
                            <span className="mt-0.5 block truncate text-sm text-muted">
                              {h.address}, {h.city} {h.province} {h.postalCode}
                            </span>
                            {officialLicenceNumber(h.licenseNumber, h.id) ? (
                              <span className="mt-0.5 block text-xs text-subtle">
                                {t("licenceNo")} {officialLicenceNumber(h.licenseNumber, h.id)}
                              </span>
                            ) : null}
                          </span>
                          {h.claimed ? (
                            <span className="shrink-0 pt-1 text-xs text-muted">{t("alreadyClaimed")}</span>
                          ) : (
                            <span className="shrink-0 pt-1 text-xs font-medium text-primary">{t("claimThis")}</span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
            {q.trim().length < 2 ? <p className="mt-3 text-sm text-muted">{t("claimEmpty")}</p> : null}
            <p className="mt-6 text-sm font-medium">{t("claimCtaSupport")}</p>
            <p className="mt-6 text-sm text-muted">
              {t("claimMissing")}{" "}
              <Link to="/provider" className="text-primary underline-offset-4 hover:underline">
                {t("listCentre")}
              </Link>
            </p>
          </>
        )}

        <details className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{t("partnerPerksTitle")}</summary>
          <FeelBanner src="/photos/brick.jpg" className="mt-4" />
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {partnerPerks.map(([Icon, key]) => (
              <li key={key} className="flex gap-3 text-sm font-medium leading-6">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {t(key)}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">{t("providerTrustBody")}</p>
        </details>

        <details id="enroll" className="mt-12 scroll-mt-24 rounded-xl bg-surface ring-1 ring-border">
          <summary className="flex min-h-11 cursor-pointer items-center px-5 py-3 text-sm font-semibold">{t("enrollFormTitle")}</summary>
        <form onSubmit={sendEnroll} className="space-y-3 px-5 pb-5">
          <h2 className="font-display text-2xl">{t("enrollFormTitle")}</h2>
          <p className="text-sm text-muted">{t("enrollFormLead")}</p>
          <p className="text-sm font-semibold">{t("daycareEnrollLead")}</p>
          <label className="block text-sm font-medium">
            {t("name")}
            <input required className="ke-input mt-1" value={enroll.name} onChange={(e) => setEnroll((s) => ({ ...s, name: e.target.value }))} autoComplete="name" />
          </label>
          <label className="block text-sm font-medium">
            {t("email")}
            <input required type="email" className="ke-input mt-1" value={enroll.email} onChange={(e) => setEnroll((s) => ({ ...s, email: e.target.value }))} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">
            {t("enrollCentre")}
            <div ref={enrollBox} className="relative mt-1">
              <input
                required
                className="ke-input"
                value={enroll.centre}
                autoComplete="off"
                placeholder={t("enrollPickHint")}
                onFocus={() => setEnrollOpen(true)}
                onChange={(e) => {
                  setEnrollManual(false);
                  setEnroll((s) => ({ ...s, centre: e.target.value, daycareId: "" }));
                }}
              />
              {enrollOpen ? (
                <ul className="z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-surface py-1 shadow-card ring-1 ring-border">
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-bg"
                      onClick={() => {
                        setEnrollManual(true);
                        setEnrollOpen(false);
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t("enrollManual")}</span>
                        <span className="mt-0.5 block text-sm text-muted">{t("enrollManualHint")}</span>
                      </span>
                    </button>
                  </li>
                  {enrollHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-bg"
                        onClick={() => {
                          setEnroll((s) => ({
                            ...s,
                            centre: h.name,
                            city: [h.city, h.province].filter(Boolean).join(", "),
                            phone: h.phone || s.phone,
                            daycareId: h.id,
                          }));
                          setEnrollManual(false);
                          setEnrollOpen(false);
                        }}
                      >
                        <ClaimHitPhoto photo={h.photo} name={h.name} compact />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{h.name}</span>
                          <span className="mt-0.5 block truncate text-sm text-muted">
                            {h.address}, {h.city} {h.province}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </label>
          <label className="block text-sm font-medium">
            {t("enrollCity")}
            <input required className="ke-input mt-1" value={enroll.city} onChange={(e) => setEnroll((s) => ({ ...s, city: e.target.value }))} />
          </label>
          <label className="block text-sm font-medium">
            {t("enrollPhone")}
            <input className="ke-input mt-1" value={enroll.phone} onChange={(e) => setEnroll((s) => ({ ...s, phone: e.target.value }))} autoComplete="tel" />
          </label>
          <label className="block text-sm font-medium">
            {t("licensePhoto")}
            <span className="mt-1 block text-xs font-normal text-muted">{t("licenceUploadLead")}</span>
            <input
              ref={enrollFileRef}
              required
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="mt-2 block min-h-11 w-full rounded-xl bg-bg px-3 py-2 text-sm text-fg ring-1 ring-border file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-fg"
              data-ke="enroll-license-file"
              onChange={(e) => readLicense(e.target.files?.[0], e.currentTarget)}
            />
            <UploadLimitHint hint={t("uploadClaimDocHint")} error={enrollLicenseError} />
          </label>
          {enrollLicense.startsWith("data:image") ? (
            <img src={enrollLicense} alt={t("claimLicenseAlt")} className="max-h-40 rounded-md object-contain ring-1 ring-border" />
          ) : enrollLicense ? (
            <p className="text-sm text-muted">{t("claimPdfSelected")}</p>
          ) : null}
          <label className="block text-sm font-medium">
            {t("enrollMessage")}
            <textarea
              required
              rows={5}
              className="ke-textarea mt-1"
              placeholder={t("enrollMessagePh")}
              value={enroll.body}
              onChange={(e) => setEnroll((s) => ({ ...s, body: e.target.value }))}
            />
          </label>
          <TurnstileField onToken={enrollChallenge.onToken} />
          <Button type="submit" size="lg" className="w-full" disabled={enrollBusy}>
            {t("sendClaimRequest")}
          </Button>
        </form>
        </details>
      </main>
    </Shell>
  );
}
