import { Share, Smartphone } from "lucide-react";

export function HomeScreenGuide({ fr }: { fr: boolean }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl md:text-3xl">
        {fr ? "Ajouter KidEase à l’écran d’accueil" : "Add KidEase to your Home Screen"}
      </h2>
      <p className="mt-3 max-w-2xl text-muted">
        {fr
          ? "L’app n’est pas encore dans l’App Store ni sur Google Play. En attendant, épinglez le site mobile — il s’ouvre plein écran, avec l’icône KidEase, comme une vraie application."
          : "The App Store and Google Play listings are coming soon. Until then, pin the mobile website to your phone. It opens full screen with the KidEase icon, just like an app."}
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <article className="rounded-xl bg-surface p-5 ring-1 ring-border md:p-6">
          <span className="grid size-10 place-items-center rounded-md bg-bg ring-1 ring-border">
            <Share className="size-5" strokeWidth={1.6} />
          </span>
          <h3 className="mt-3 font-display text-xl">{fr ? "iPhone et iPad" : "iPhone and iPad"}</h3>
          <p className="mt-1 text-sm text-muted">{fr ? "Utilisez Safari — pas Chrome." : "Use Safari — not Chrome."}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              {fr
                ? "Ouvrez kidease.ca dans Safari (pas dans Instagram, Facebook ou Chrome)."
                : "Open kidease.ca in Safari (not in Instagram, Facebook, or Chrome)."}
            </li>
            <li>
              {fr
                ? "Touchez Partager — le carré avec la flèche vers le haut, en bas de l’écran."
                : "Tap Share — the square with the arrow pointing up, at the bottom of the screen."}
            </li>
            <li>
              {fr
                ? "Faites défiler et touchez Sur l’écran d’accueil."
                : "Scroll the sheet and tap Add to Home Screen."}
            </li>
            <li>
              {fr
                ? "Touchez Ajouter. L’épingle KidEase apparaît à côté de vos autres apps."
                : "Tap Add. The KidEase pin appears next to your other apps."}
            </li>
          </ol>
        </article>
        <article className="rounded-xl bg-surface p-5 ring-1 ring-border md:p-6">
          <span className="grid size-10 place-items-center rounded-md bg-bg ring-1 ring-border">
            <Smartphone className="size-5" strokeWidth={1.6} />
          </span>
          <h3 className="mt-3 font-display text-xl">{fr ? "Téléphones Google / Android" : "Google / Android phones"}</h3>
          <p className="mt-1 text-sm text-muted">{fr ? "Utilisez Chrome." : "Use Chrome."}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>{fr ? "Ouvrez kidease.ca dans Chrome." : "Open kidease.ca in Chrome."}</li>
            <li>
              {fr
                ? "Touchez le menu à trois points, en haut à droite."
                : "Tap the three-dot menu at the top right."}
            </li>
            <li>
              {fr
                ? "Touchez Ajouter à l’écran d’accueil ou Installer l’application."
                : "Tap Add to Home screen or Install app."}
            </li>
            <li>
              {fr
                ? "Touchez Ajouter ou Installer. L’icône KidEase se pose sur l’accueil."
                : "Tap Add or Install. The KidEase icon lands on your Home Screen."}
            </li>
          </ol>
        </article>
      </div>
      <p className="mt-4 text-sm text-subtle">
        {fr
          ? "Astuce iPhone : Chrome sur iOS ne peut pas ajouter l’app plein écran. Passez par Safari."
          : "iPhone tip: Chrome on iOS cannot add the full-screen app. Use Safari."}
      </p>
    </section>
  );
}
