import { useCopy } from "@/lib/use-copy";

export function HomeScreenGuide() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <section id="add-to-home" className="mt-14 rounded-xl bg-surface p-6 ring-1 ring-border md:p-8">
      <h2 className="font-display text-2xl">
        {fr ? "Ajouter KidEase \u00e0 l\u2019\u00e9cran d\u2019accueil" : "Add KidEase to your home screen"}
      </h2>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {fr
          ? "Pas besoin de l\u2019App Store pour l\u2019instant. Ouvrez kidease.ca dans le navigateur du t\u00e9l\u00e9phone, puis \u00e9pinglez-le comme une appli. L\u2019ic\u00f4ne KidEase s\u2019ouvre en plein \u00e9cran."
          : "You don\u2019t need the App Store yet. Open kidease.ca on your phone, then pin it like an app. The navy KidEase pin sits on your home screen and opens full screen."}
      </p>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="font-display text-lg">{fr ? "iPhone et iPad (Safari)" : "iPhone and iPad (Safari)"}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>{fr ? "Ouvrez kidease.ca dans Safari \u2014 pas Chrome." : "Open kidease.ca in Safari \u2014 not Chrome."}</li>
            <li>
              {fr
                ? "Touchez Partager (carr\u00e9 avec la fl\u00e8che vers le haut), en bas de l\u2019\u00e9cran."
                : "Tap Share (the square with the up arrow) at the bottom of the screen."}
            </li>
            <li>{fr ? "Faites d\u00e9filer et touchez Sur l\u2019\u00e9cran d\u2019accueil." : "Scroll and tap Add to Home Screen."}</li>
            <li>
              {fr
                ? "Touchez Ajouter. L\u2019\u00e9pingle KidEase appara\u00eet sur l\u2019\u00e9cran d\u2019accueil."
                : "Tap Add. The navy KidEase pin appears on your home screen."}
            </li>
          </ol>
        </div>
        <div>
          <h3 className="font-display text-lg">{fr ? "T\u00e9l\u00e9phone Android (Chrome)" : "Google phones (Chrome)"}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>{fr ? "Ouvrez kidease.ca dans Chrome." : "Open kidease.ca in Chrome."}</li>
            <li>{fr ? "Touchez les trois points en haut \u00e0 droite." : "Tap the three dots at the top right."}</li>
            <li>
              {fr
                ? "Touchez Ajouter \u00e0 l\u2019\u00e9cran d\u2019accueil ou Installer l\u2019application."
                : "Tap Add to Home screen or Install app."}
            </li>
            <li>
              {fr
                ? "Touchez Ajouter / Installer. KidEase appara\u00eet avec vos autres applis."
                : "Tap Add / Install. KidEase appears with your other apps."}
            </li>
          </ol>
        </div>
      </div>
      <p className="mt-6 text-sm text-subtle">
        {fr
          ? "Sur iPhone, utilisez Safari. Chrome sur iPhone ne peut pas ajouter l\u2019appli plein \u00e9cran de la m\u00eame fa\u00e7on."
          : "On iPhone, use Safari. Chrome on iPhone cannot add the full-screen app the same way."}
      </p>
    </section>
  );
}
