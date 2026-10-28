import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChipButton } from "@/components/chip";
import { RatioBoard } from "@/components/ratio-board";
import { TaxReceiptStudio } from "@/components/tax-receipt-studio";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { localePath } from "@/lib/locale-path";
import { getProvider } from "@/lib/server/family";
import { useCopy } from "@/lib/use-copy";

const DailyCareDesk = lazy(() => import("@/components/daily-care-desk").then((m) => ({ default: m.DailyCareDesk })));

type ClaimedCentre = { id: string; name: string; city: string; spots: number; waitlist: number };

type Tab = "spots" | "classroom" | "staff" | "billing" | "org";

const TABS: Array<{ id: Tab; en: string; fr: string }> = [
  { id: "spots", en: "Spots, tours, waitlist", fr: "Places, visites, liste" },
  { id: "classroom", en: "Classroom", fr: "Local" },
  { id: "staff", en: "Staff and hiring", fr: "Personnel et embauche" },
  { id: "billing", en: "Billing and receipts", fr: "Factures et reçus" },
  { id: "org", en: "All locations", fr: "Tous les sites" },
];

function daysUntil(iso: string, now = Date.now()): number | null {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - now) / (24 * 60 * 60 * 1000));
}

export function ProviderPioneerDesk() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [tab, setTab] = useState<Tab>("spots");
  const [hiring, setHiring] = useState(false);
  const [firstAid, setFirstAid] = useState("");
  const [vsc, setVsc] = useState("");
  const [sites, setSites] = useState("");
  const [spots, setSpots] = useState("");
  const [waitlist, setWaitlist] = useState("");
  const [orgEdited, setOrgEdited] = useState(false);
  const [claimed, setClaimed] = useState<ClaimedCentre[]>([]);
  const { user } = useCurrentUserState();
  const firstAidDays = daysUntil(firstAid);
  const vscDays = daysUntil(vsc);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void getProvider()
      .then((desk) => {
        if (!live) return;
        const rows = (desk.listings || []).map((listing) => ({
          id: listing.id,
          name: listing.name,
          city: listing.city,
          spots: (listing.spotsInfant || 0) + (listing.spotsToddler || 0) + (listing.spotsPreschool || 0),
          waitlist: listing.waitlist || 0,
        }));
        setClaimed(rows);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [user]);

  useEffect(() => {
    if (orgEdited || !claimed.length) return;
    setSites(String(claimed.length));
    setSpots(String(claimed.reduce((sum, row) => sum + row.spots, 0)));
    setWaitlist(String(claimed.reduce((sum, row) => sum + row.waitlist, 0)));
  }, [claimed, orgEdited]);

  const siteCount = Number(sites);
  const openSpots = Number(spots);
  const waiting = Number(waitlist);

  return (
    <div data-ke="provider-pioneer-desk">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((item) => (
          <ChipButton key={item.id} on={tab === item.id} className="shrink-0" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
            {fr ? item.fr : item.en}
          </ChipButton>
        ))}
      </div>
      {tab === "spots" ? (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <h2 className="font-display text-2xl">{fr ? "Places, visites et liste d'attente" : "Open spots, tours, and waitlist"}</h2>
          <p className="mt-2 text-sm text-muted">
            {fr
              ? "Commencez ici. Vous n'avez pas à configurer les locaux pour publier une place."
              : "Start here. You do not have to set up classrooms to post an open spot."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link to={localePath("/provider", locale)} search={{ desk: "listings" }}>{fr ? "Places ouvertes" : "Open spots"}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to={localePath("/provider", locale)} search={{ desk: "tours" }}>{fr ? "Visites" : "Tours"}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link to={localePath("/provider", locale)} search={{ desk: "requests" }}>{fr ? "Liste d'attente" : "Waitlist"}</Link>
            </Button>
          </div>
        </section>
      ) : null}
      {tab === "classroom" ? (
        <div className="mt-4 space-y-4">
          <RatioBoard />
          {user ? (
            <Suspense fallback={<p className="text-sm text-muted">{fr ? "Chargement du local." : "Loading the classroom."}</p>}>
              <DailyCareDesk role="provider" />
            </Suspense>
          ) : null}
        </div>
      ) : null}
      {tab === "staff" ? (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <h2 className="font-display text-2xl">{fr ? "Personnel" : "Staff"}</h2>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={hiring} onChange={(event) => setHiring(event.target.checked)} />
            {fr ? "Nous embauchons des EPE / GAE" : "We're hiring ECEs / CCAs"}
          </label>
          {hiring ? (
            <p className="mt-2 text-sm">
              <Link to={localePath("/jobs/post", locale)} className="font-semibold text-primary underline-offset-4 hover:underline">
                {fr ? "Publier le poste" : "Post the role"}
              </Link>
            </p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Fin des premiers soins" : "First aid expiry"}</span>
              <input type="date" className="ke-input mt-1 w-full" value={firstAid} onChange={(event) => setFirstAid(event.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Fin de la vérification du secteur vulnérable" : "Vulnerable sector check expiry"}</span>
              <input type="date" className="ke-input mt-1 w-full" value={vsc} onChange={(event) => setVsc(event.target.value)} />
            </label>
          </div>
          {firstAidDays != null && firstAidDays <= 30 ? (
            <p className="mt-3 text-sm text-rose-800" role="status">
              {fr ? `Premiers soins : ${firstAidDays} jours.` : `First aid: ${firstAidDays} days.`}
            </p>
          ) : null}
          {vscDays != null && vscDays <= 30 ? (
            <p className="mt-2 text-sm text-rose-800" role="status">
              {fr ? `Vérification : ${vscDays} jours.` : `Vulnerable sector check: ${vscDays} days.`}
            </p>
          ) : null}
        </section>
      ) : null}
      {tab === "billing" ? (
        <div className="mt-4">
          <TaxReceiptStudio quebec />
        </div>
      ) : null}
      {tab === "org" ? (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <h2 className="font-display text-2xl">{fr ? "Plusieurs sites" : "More than one site"}</h2>
          <p className="mt-2 text-sm text-muted">
            {fr
              ? "Entrez vos chiffres. KidEase n'invente pas l'occupation."
              : "Type your own figures. KidEase does not invent occupancy."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              {fr ? "Sites revendiqués" : "Claimed sites"}
              <input className="ke-input mt-1 w-full" inputMode="numeric" value={sites} onChange={(event) => { setOrgEdited(true); setSites(event.target.value.replace(/[^\d]/g, "").slice(0, 3)); }} />
            </label>
            <label className="block text-sm">
              {fr ? "Places ouvertes" : "Open spots"}
              <input className="ke-input mt-1 w-full" inputMode="numeric" value={spots} onChange={(event) => { setOrgEdited(true); setSpots(event.target.value.replace(/[^\d]/g, "").slice(0, 4)); }} />
            </label>
            <label className="block text-sm">
              {fr ? "Liste d'attente" : "Waitlist"}
              <input className="ke-input mt-1 w-full" inputMode="numeric" value={waitlist} onChange={(event) => { setOrgEdited(true); setWaitlist(event.target.value.replace(/[^\d]/g, "").slice(0, 5)); }} />
            </label>
          </div>
          {claimed.length ? (
            <ul className="mt-3 space-y-1 text-sm" data-ke="org-claimed-centres">
              {claimed.map((centre) => (
                <li key={centre.id}>
                  {centre.name} · {centre.city} · {centre.spots} {fr ? "places" : "spots"} · {centre.waitlist} {fr ? "en attente" : "waiting"}
                </li>
              ))}
            </ul>
          ) : null}
          {Number.isFinite(siteCount) && siteCount >= 1 ? (
            <p className="mt-3 text-sm">
              {fr
                ? `${siteCount} sites · ${Number.isFinite(openSpots) ? openSpots : 0} places · ${Number.isFinite(waiting) ? waiting : 0} en attente.`
                : `${siteCount} sites · ${Number.isFinite(openSpots) ? openSpots : 0} open spots · ${Number.isFinite(waiting) ? waiting : 0} waiting.`}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted">{fr ? "Ajoutez un site revendiqué pour voir le sommaire." : "Add a claimed site to see the rollup."}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
