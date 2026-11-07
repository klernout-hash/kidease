import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Briefcase, GraduationCap, Languages, MapPin, PawPrint, Sparkles } from "lucide-react";
import { getMyAbout, saveMyAbout } from "@/lib/server/profile-about";
import { emptyProfileAbout, type ProfileAbout } from "@/lib/profile-about";
import { useCopy } from "@/lib/use-copy";
import { isSafeSitemapSlug } from "@/lib/sitemap";

const FIELDS: Array<{ key: keyof ProfileAbout; icon: typeof Briefcase; en: string; fr: string }> = [
  { key: "work", icon: Briefcase, en: "Work", fr: "Travail" },
  { key: "education", icon: GraduationCap, en: "Education", fr: "Études" },
  { key: "pets", icon: PawPrint, en: "Pets", fr: "Animaux" },
  { key: "languages", icon: Languages, en: "Languages", fr: "Langues" },
  { key: "interests", icon: Sparkles, en: "Interests", fr: "Intérêts" },
  { key: "region", icon: MapPin, en: "Region", fr: "Région" },
];

/** Private About you. Nothing here is shown on a public daycare listing. */
export function AboutYouForm() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [about, setAbout] = useState<ProfileAbout>(emptyProfileAbout());
  const [centres, setCentres] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void getMyAbout()
      .then((row) => {
        if (!live) return;
        setAbout({
          work: row.work,
          education: row.education,
          pets: row.pets,
          languages: row.languages,
          interests: row.interests,
          region: row.region,
        });
        setCentres(row.centres);
      })
      .catch(() => {
        if (live) setNote(fr ? "Le profil n’a pas pu se charger." : "Your profile could not load.");
      });
    return () => {
      live = false;
    };
  }, [fr]);

  async function onSave() {
    setBusy(true);
    setNote("");
    try {
      const saved = await saveMyAbout({ data: about });
      setAbout({
        work: saved.work,
        education: saved.education,
        pets: saved.pets,
        languages: saved.languages,
        interests: saved.interests,
        region: saved.region,
      });
      setCentres(saved.centres);
      setNote(fr ? "Enregistré sur votre compte seulement." : "Saved on your account only.");
    } catch {
      setNote(fr ? "Enregistrement impossible." : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="mt-6 space-y-3" data-ke="about-you">
      <legend className="text-base font-semibold">{fr ? "À propos de vous" : "About you"}</legend>
      <p className="text-sm leading-6 text-muted">
        {fr
          ? "Facultatif. Visible seulement sur votre compte. Aucun badge vérifié n’est ajouté ici."
          : "Optional. Only on your account. This does not add a verified badge."}
      </p>
      {FIELDS.map((field) => {
        const Icon = field.icon;
        return (
          <label key={field.key} className="block text-sm font-medium">
            <span className="inline-flex items-center gap-2">
              <Icon className="size-4 text-muted" aria-hidden />
              {fr ? field.fr : field.en}
            </span>
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
          <ul className="mt-1 space-y-1 text-sm">
            {centres.filter((slug) => isSafeSitemapSlug(slug)).map((slug) => (
              <li key={slug}>
                <Link to="/daycare/$slug" params={{ slug }} className="text-primary underline-offset-4 hover:underline">
                  {slug}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        data-ke="about-you-save"
        disabled={busy}
        onClick={() => void onSave()}
        className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm font-semibold text-bg touch-manipulation"
      >
        {busy ? (fr ? "Enregistrement" : "Saving") : fr ? "Enregistrer à propos de vous" : "Save about you"}
      </button>
      {note ? <p className="text-sm" role="status">{note}</p> : null}
    </fieldset>
  );
}
