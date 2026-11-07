import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, GraduationCap, Languages, MapPin, PawPrint, Sparkles } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyAbout, saveMyAbout, type AboutProfile } from "@/lib/server/profile-about";
import { emptyProfileAbout, type LinkedCentre, type ProfileAbout } from "@/lib/profile-about";
import { useCopy } from "@/lib/use-copy";
import { isSafeSitemapSlug } from "@/lib/sitemap";

const FIELDS: Array<{ key: keyof ProfileAbout; icon: typeof Briefcase; en: string; fr: string; hintEn: string; hintFr: string }> = [
  { key: "work", icon: Briefcase, en: "Work", fr: "Travail", hintEn: "What you do", hintFr: "Ce que vous faites" },
  { key: "education", icon: GraduationCap, en: "Education", fr: "Études", hintEn: "School or training", hintFr: "École ou formation" },
  { key: "pets", icon: PawPrint, en: "Pets", fr: "Animaux", hintEn: "Animals at home", hintFr: "Animaux à la maison" },
  { key: "languages", icon: Languages, en: "Languages", fr: "Langues", hintEn: "Languages you speak", hintFr: "Langues parlées" },
  { key: "interests", icon: Sparkles, en: "Interests", fr: "Intérêts", hintEn: "What you enjoy", hintFr: "Ce que vous aimez" },
  { key: "region", icon: MapPin, en: "Region", fr: "Région", hintEn: "City or area, not a street", hintFr: "Ville ou secteur, pas une rue" },
];

function sameAbout(a: ProfileAbout, b: ProfileAbout) {
  return FIELDS.every((field) => a[field.key] === b[field.key]);
}

/** Private About you. Nothing here is shown on a public daycare listing. */
export function AboutYouForm({ preview }: { preview?: AboutProfile }) {
  const { locale } = useCopy();
  const { user } = useCurrentUserState();
  const fr = locale === "fr";
  const [saved, setSaved] = useState<ProfileAbout>(preview ?? emptyProfileAbout());
  const [about, setAbout] = useState<ProfileAbout>(preview ?? emptyProfileAbout());
  const [centres, setCentres] = useState<LinkedCentre[]>(preview?.centres ?? []);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !sameAbout(about, saved);

  useEffect(() => {
    if (preview) return;
    let live = true;
    void getMyAbout()
      .then((row) => {
        if (!live) return;
        const next = {
          work: row.work,
          education: row.education,
          pets: row.pets,
          languages: row.languages,
          interests: row.interests,
          region: row.region,
        };
        setSaved(next);
        setAbout(next);
        setCentres(row.centres);
      })
      .catch(() => {
        if (live) setNote(fr ? "Le profil n’a pas pu se charger." : "Your profile could not load.");
      });
    return () => {
      live = false;
    };
  }, [fr, preview]);

  async function onSave() {
    setBusy(true);
    setNote("");
    try {
      const stored = await saveMyAbout({ data: about });
      const next = {
        work: stored.work,
        education: stored.education,
        pets: stored.pets,
        languages: stored.languages,
        interests: stored.interests,
        region: stored.region,
      };
      setSaved(next);
      setAbout(next);
      setCentres(stored.centres);
      setNote(fr ? "Enregistré sur votre compte seulement." : "Saved on your account only.");
    } catch {
      setNote(fr ? "Enregistrement impossible." : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-6 space-y-3" data-ke="about-you" data-dirty={dirty ? "1" : "0"}>
      <legend className="text-base font-semibold">{fr ? "À propos de vous" : "About you"}</legend>
      <div className="flex items-center gap-3">
        <ProfileAvatar userId={user?.id} fallback={user?.profileImageUrl} name={user?.displayName} size="lg" />
        <p className="text-sm leading-6 text-muted">
          {fr
            ? "Facultatif. Visible seulement sur votre compte. Aucun badge vérifié n’est ajouté ici."
            : "Optional. Only on your account. This does not add a verified badge."}
        </p>
      </div>
      {FIELDS.map((field) => {
        const Icon = field.icon;
        return (
          <label key={field.key} className="block text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <Icon className="size-4 text-muted" aria-hidden />
              {fr ? field.fr : field.en}
            </span>
            <span className="mt-0.5 block text-xs font-normal text-muted">{fr ? field.hintFr : field.hintEn}</span>
            <input
              className="ke-input mt-1 w-full"
              value={about[field.key]}
              maxLength={80}
              data-ke={`about-${field.key}`}
              onChange={(event) => setAbout((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        );
      })}
      {centres.length ? (
        <div data-ke="about-centres">
          <p className="text-sm font-medium">{fr ? "Centres liés" : "Linked centres"}</p>
          <ul className="mt-2 space-y-2">
            {centres.filter((centre) => isSafeSitemapSlug(centre.slug)).map((centre) => (
              <li key={centre.slug}>
                <Link
                  to="/daycare/$slug"
                  params={{ slug: centre.slug }}
                  data-ke="about-centre-card"
                  className="block rounded-2xl bg-surface p-3 text-inherit no-underline ring-1 ring-border"
                >
                  <span className="block font-semibold">{centre.name}</span>
                  <span className="block text-sm text-muted">{[centre.city, centre.province].filter(Boolean).join(", ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-ke="about-you-save"
          disabled={busy || !dirty}
          onClick={() => void onSave()}
          className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold text-bg touch-manipulation disabled:opacity-50"
        >
          {busy ? (fr ? "Enregistrement" : "Saving") : fr ? "Enregistrer" : "Save"}
        </button>
        <button
          type="button"
          data-ke="about-you-cancel"
          disabled={!dirty || busy}
          onClick={() => {
            setAbout(saved);
            setNote("");
          }}
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-border touch-manipulation disabled:opacity-50"
        >
          {fr ? "Annuler" : "Cancel"}
        </button>
      </div>
      {note ? (
        <p className="text-sm" role="status">
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}
