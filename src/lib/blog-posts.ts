/**
 * Starter notes stored in the repo. Facts only: no fees, ratings,
 * review counts, or government claims.
 */

export type BlogLocale = "en" | "fr";

export type BlogPost = {
  slug: string;
  published: string;
  cta: "search" | "claim";
  title: Record<BlogLocale, string>;
  description: Record<BlogLocale, string>;
  paragraphs: Record<BlogLocale, readonly string[]>;
};

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "find-care",
    published: "2026-11-16",
    cta: "search",
    title: {
      en: "How to find care on KidEase",
      fr: "Comment trouver une place sur KidEase",
    },
    description: {
      en: "Search licensed daycares in Canada by city, open a listing, and ask the centre for a tour.",
      fr: "Cherchez des garderies autorisées au Canada par ville, ouvrez une fiche et demandez une visite au centre.",
    },
    paragraphs: {
      en: [
        "KidEase is a directory of licensed daycares in Canada. Type your city. You see the centres on file for that place.",
        "A listing shows only what the centre or a public record has supplied. If a fee, a photo, or an open spot is missing, the page leaves it blank.",
        "When you want a visit, request a tour from the listing. The centre sees the request and replies. KidEase does not decide who gets a place.",
        "Save the centres you want to compare. Then open one and take the next step there.",
      ],
      fr: [
        "KidEase est un répertoire de garderies autorisées au Canada. Écrivez votre ville. Vous voyez les centres qui sont au dossier pour cet endroit.",
        "Une fiche montre seulement ce que le centre ou un dossier public a fourni. S’il manque des frais, une photo ou une place ouverte, la page laisse le champ vide.",
        "Quand vous voulez une visite, demandez-la depuis la fiche. Le centre voit la demande et répond. KidEase ne décide pas qui obtient une place.",
        "Enregistrez les centres que vous voulez comparer. Ensuite, ouvrez-en un et faites l’étape suivante là.",
      ],
    },
  },
  {
    slug: "daycare-tour",
    published: "2026-11-16",
    cta: "search",
    title: {
      en: "What to look for on a daycare tour",
      fr: "Quoi regarder pendant une visite",
    },
    description: {
      en: "Questions to ask on a visit. KidEase does not score centres.",
      fr: "Des questions à poser pendant une visite. KidEase ne note pas les centres.",
    },
    paragraphs: {
      en: [
        "A tour is a visit you ask the centre for. KidEase shows the times the centre has posted. If none are posted, the listing says so.",
        "Ask which ages they care for and which hours they are open.",
        "Ask what a place costs. If the listing has no fee, the centre has not posted one on KidEase.",
        "Look at the rooms they let you see. Write your questions down before you go. KidEase does not rank centres.",
      ],
      fr: [
        "Une visite, c’est un rendez-vous que vous demandez au centre. KidEase montre les heures que le centre a publiées. S’il n’y en a pas, la fiche le dit.",
        "Demandez quels âges ils accueillent et quelles heures ils sont ouverts.",
        "Demandez ce qu’une place coûte. Si la fiche n’a pas de frais, le centre n’en a pas publié sur KidEase.",
        "Regardez les pièces qu’on vous laisse voir. Écrivez vos questions avant d’y aller. KidEase ne classe pas les centres.",
      ],
    },
  },
  {
    slug: "claim-your-listing",
    published: "2026-11-16",
    cta: "claim",
    title: {
      en: "How a daycare claims its listing",
      fr: "Comment une garderie revendique sa fiche",
    },
    description: {
      en: "Find your centre, start a claim, and add the facts you want parents to see.",
      fr: "Trouvez votre centre, commencez une revendication et ajoutez les faits que les parents doivent voir.",
    },
    paragraphs: {
      en: [
        "Search your centre's name on the claim page. KidEase shows matches from the directory. A generic word like daycare is not enough on its own.",
        "If you find your centre, start a claim. KidEase checks it with you. Sending a claim does not approve it by itself.",
        "If the search has no match, you can tell KidEase the centre is missing.",
        "After a claim is approved, you can add fees, photos, and tour times. KidEase does not fill those in for you.",
      ],
      fr: [
        "Cherchez le nom de votre centre sur la page de revendication. KidEase montre les correspondances du répertoire. Un mot général comme garderie ne suffit pas tout seul.",
        "Si vous trouvez votre centre, commencez une revendication. KidEase la vérifie avec vous. Envoyer une demande ne l’approuve pas toute seule.",
        "Si la recherche ne donne rien, vous pouvez dire à KidEase que le centre manque.",
        "Quand une revendication est approuvée, vous pouvez ajouter les frais, les photos et les heures de visite. KidEase ne les invente pas pour vous.",
      ],
    },
  },
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function blogPost(slug: string | null | undefined): BlogPost | null {
  const key = String(slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(key)) return null;
  return BLOG_POSTS.find((post) => post.slug === key) ?? null;
}

export function blogIndexPath(locale: string): string {
  return locale === "fr" ? "/fr/blog" : "/blog";
}

export function blogPostPath(slug: string, locale: string): string {
  return `${blogIndexPath(locale)}/${slug}`;
}

/** Article URLs for the sitemap. The index lives with the other static pages. */
export function blogArticlePaths(): string[] {
  const out: string[] = [];
  for (const post of BLOG_POSTS) {
    out.push(blogPostPath(post.slug, "en"));
    out.push(blogPostPath(post.slug, "fr"));
  }
  return out;
}

export function blogCta(post: BlogPost, locale: string): { href: string; label: string } {
  const fr = locale === "fr";
  if (post.cta === "claim") {
    return { href: fr ? "/fr/claim" : "/claim", label: fr ? "Revendiquer votre fiche" : "Claim your listing" };
  }
  return { href: fr ? "/fr/search" : "/search", label: fr ? "Chercher une garderie" : "Search daycares" };
}
