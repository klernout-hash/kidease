import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Globe, MapPin, Megaphone, MessageCircle, Smartphone, TrendingUp, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { searchClaimable, startClaim, submitEnrollLicense, verifyClaim, type ClaimHit } from "@/lib/server/claims";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

export const Route = createFileRoute("/claim")({
  validateSearch: (s: Record<string, unknown>) => {
    const q = typeof s.q === "string" ? s.q : "";
    const id = typeof s.id === "string" ? s.id : "";
    return {
      ...(q ? { q } : {}),
      ...(id ? { id } : {}),
    };
  },
  component: ClaimPage,
});

function ClaimPage() {
  const search = Route.useSearch();
  const q0 = search.q ?? "";
  const id0 = search.id ?? "";
  const { t } = useCopy();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [q, setQ] = useState(q0);
  const [hits, setHits] = useState<ClaimHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ daycareId: string; name: string; code: string } | null>(null);
  const [code, setCode] = useState("");
  const [license, setLicense] = useState("");
  const [enroll, setEnroll] = useState({ name: "", email: "", centre: "", city: "", phone: "", body: "", daycareId: "" });
  const [enrollLicense, setEnrollLicense] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollHits, setEnrollHits] = useState<ClaimHit[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollManual, setEnrollManual] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const enrollBox = useRef<HTMLDivElement>(null);
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
        .finally(() => setBusy(false));
    }, 180);
    return () => window.clearTimeout(tmr);
  }, [q]);

  useEffect(() => {
    if (!id0 || !user) return;
    void begin(id0);
  }, [id0, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#enroll") return;
    const el = document.getElementById("enroll");
    if (!el) return;
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
      void navigate({ to: "/login", search: { next: `/claim?id=${daycareId}`, role: "provider", intent: "in" } });
      return;
    }
    setBusy(true);
    try {
      const res = await startClaim({ data: daycareId });
      if (res.alreadyOwned) {
        toast.success(t("claimOwned"));
        void navigate({ to: "/provider" });
        return;
      }
      setPending({ daycareId: res.daycareId, name: res.centreName ?? t("provider"), code: res.code });
      setCode(res.code);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("claimFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!license.startsWith("data:image")) {
      toast.error("Upload a photo of your provincial licence");
      return;
    }
    setBusy(true);
    try {
      await verifyClaim({ data: { daycareId: pending.daycareId, code, licensePhoto: license, turnstileToken: claimChallenge.token } });
      toast.success(t("claimVerified"));
      void navigate({ to: "/provider" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("claimFailed"));
    } finally {
      setBusy(false);
    }
  }

  function readLicense(file: File | undefined, into: "claim" | "enroll") {
    if (!file) return;
    if (file.size > 1_800_000) {
      toast.error(t("photoTooBig"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      if (into === "claim") setLicense(value);
      else setEnrollLicense(value);
    };
    reader.readAsDataURL(file);
  }

  async function sendEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollLicense.startsWith("data:image")) {
      toast.error("Upload a photo of your provincial licence");
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
      toast.success(t("enrollSent"));
      setEnroll({ name: "", email: "", centre: "", city: "", phone: "", body: "", daycareId: "" });
      setEnrollLicense("");
    } catch {
      toast.error(`Could not send. Email ${SUPPORT_INBOX_EMAIL} directly.`);
    } finally {
      setEnrollBusy(false);
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t("provider")}</p>
        <h1 className="mt-3 font-display text-4xl">{t("claimTitle")}</h1>
        <p className="mt-3 max-w-xl text-muted">{t("providerDiscover")}</p>
        <p className="mt-2 max-w-xl text-sm text-subtle">{t("claimLead")}</p>

        <h2 className="mt-10 font-display text-2xl">{t("partnerPerksTitle")}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              [Users, "perkParents"],
              [Megaphone, "perkBrand"],
              [Globe, "perkPage"],
              [CalendarCheck, "perkSpots"],
              [MessageCircle, "perkChat"],
              [MapPin, "perkNear"],
              [Smartphone, "perkMobile"],
              [Wallet, "perkPay"],
              [TrendingUp, "perkGrow"],
            ] as const
          ).map(([Icon, key]) => (
            <li key={key} className="flex gap-3 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <p className="text-sm font-medium leading-6">{t(key)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm text-muted">{t("providerTrustBody")}</p>

        {pending ? (
          <form onSubmit={verify} className="mt-8 space-y-4 rounded-xl bg-surface p-5 ring-1 ring-border">
            <h2 className="font-display text-2xl">{t("verifyListing")}</h2>
            <p className="text-sm text-muted">
              {t("verifyLead")} <span className="font-medium text-fg">{pending.name}</span>
            </p>
            <div className="rounded-lg bg-primary/10 px-3 py-3 text-sm">
              <p className="font-medium">{t("claimCodeSent")}</p>
              <p className="mt-1 font-mono text-lg tracking-[0.2em]">{pending.code}</p>
              <p className="mt-1 text-xs text-muted">{t("claimCodeHint")}</p>
            </div>
            <label className="block text-sm">
              {t("claimCode")}
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 font-mono tracking-widest"
                autoComplete="one-time-code"
              />
            </label>
            <label className="block text-sm font-medium">
              Provincial licence photo
              <span className="mt-1 block text-xs font-normal text-muted">Required. Photo or scan of the current licence.</span>
              <input required type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => readLicense(e.target.files?.[0], "claim")} />
            </label>
            {license ? <img src={license} alt="Licence preview" className="max-h-40 rounded-md object-contain ring-1 ring-border" /> : null}
            <TurnstileField onToken={claimChallenge.onToken} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {t("finishClaim")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>
                {t("back")}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div ref={box} className="relative mt-6">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => hits.length > 0 && setOpen(true)}
                placeholder={t("claimSearchPh")}
                autoComplete="off"
                className="h-12 w-full rounded-full bg-surface px-5 shadow-card ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
              />
              {busy && q.trim().length >= 2 ? (
                <p className="absolute right-3 top-3.5 text-xs text-muted">{t("loading")}</p>
              ) : null}
              {open && q.trim().length >= 2 ? (
                <ul className="absolute z-20 mt-1 max-h-[min(60vh,28rem)] w-full overflow-y-auto rounded-xl bg-surface py-1 shadow-card ring-1 ring-border">
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
                          <img src={h.photo} alt="" className="mt-0.5 size-12 shrink-0 rounded-md object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{h.name}</span>
                            <span className="mt-0.5 block truncate text-sm text-muted">
                              {h.address}, {h.city} {h.province} {h.postalCode}
                            </span>
                            {h.licenseNumber ? (
                              <span className="mt-0.5 block text-xs text-subtle">
                                {t("licenceNo")} {h.licenseNumber}
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

        <form id="enroll" onSubmit={sendEnroll} className="mt-12 scroll-mt-24 space-y-3 rounded-xl bg-surface p-5 ring-1 ring-border">
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
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-surface py-1 shadow-card ring-1 ring-border">
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
                        <img src={h.photo} alt="" className="mt-0.5 size-10 shrink-0 rounded-md object-cover" />
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
            Provincial licence photo
            <span className="mt-1 block text-xs font-normal text-muted">Required for compliance review. Clear photo or scan of the current licence.</span>
            <input required type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => readLicense(e.target.files?.[0], "enroll")} />
          </label>
          {enrollLicense ? <img src={enrollLicense} alt="Licence preview" className="max-h-40 rounded-md object-contain ring-1 ring-border" /> : null}
          <label className="block text-sm font-medium">
            {t("enrollMessage")}
            <textarea
              required
              rows={5}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2"
              placeholder={t("enrollMessagePh")}
              value={enroll.body}
              onChange={(e) => setEnroll((s) => ({ ...s, body: e.target.value }))}
            />
          </label>
          <TurnstileField onToken={enrollChallenge.onToken} />
          <Button type="submit" size="lg" className="w-full" disabled={enrollBusy}>
            {t("enrollNow")}
          </Button>
        </form>
      </main>
      <SiteFooter />
    </Shell>
  );
}
