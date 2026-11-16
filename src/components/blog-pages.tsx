import { Link } from "@tanstack/react-router";
import { JsonLd } from "@/components/json-ld";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import {
  BLOG_POSTS,
  blogCta,
  blogIndexPath,
  blogPost,
  blogPostPath,
  type BlogPost,
} from "@/lib/blog-posts";
import { pageCanonicalUrl } from "@/lib/page-seo";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

function blogLocale(locale: string): "en" | "fr" {
  return locale === "fr" ? "fr" : "en";
}

function articleJson(post: BlogPost, locale: "en" | "fr"): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title[locale],
    description: post.description[locale],
    datePublished: post.published,
    inLanguage: locale === "fr" ? "fr-CA" : "en-CA",
    author: { "@type": "Organization", name: "KidEase" },
    publisher: { "@type": "Organization", name: "KidEase" },
    mainEntityOfPage: pageCanonicalUrl(blogPostPath(post.slug, locale)),
  });
}

export function BlogIndex() {
  const { locale } = useCopy();
  const lang = blogLocale(locale);
  const fr = lang === "fr";
  const search = blogCta(BLOG_POSTS[0]!, lang);
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-12 md:py-16" data-ke="blog">
        <p className="text-sm font-semibold tracking-wide text-primary">KidEase</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{fr ? "Blogue" : "Blog"}</h1>
        <p className="mt-4 max-w-prose text-lg text-muted">
          {fr
            ? "KidEase est un répertoire canadien de garderies autorisées. Ces notes aident à chercher, à visiter un centre ou à revendiquer une fiche."
            : "KidEase is a Canadian directory of licensed daycares. These notes help you search, visit a centre, or claim a listing."}
        </p>
        <div className="mt-6">
          <Button asChild className="min-h-11 min-w-11 touch-manipulation">
            <Link to={search.href}>{search.label}</Link>
          </Button>
        </div>
        <ul className="mt-10 space-y-3">
          {BLOG_POSTS.map((post) => (
            <li key={post.slug} className="rounded-xl bg-surface ring-1 ring-border">
              <Link
                to={lang === "fr" ? "/fr/blog/$slug" : "/blog/$slug"}
                params={{ slug: post.slug }}
                className="block min-h-11 px-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <h2 className="text-lg font-semibold">{post.title[lang]}</h2>
                <p className="mt-1 text-sm leading-6 text-muted">{post.description[lang]}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </Shell>
  );
}

export function BlogArticle({ slug }: { slug: string }) {
  const { locale } = useCopy();
  const lang = blogLocale(locale);
  const post = blogPost(slug);
  if (!post) return <MissingBlogPost />;
  const fr = lang === "fr";
  const cta = blogCta(post, lang);
  const date = new Date(`${post.published}T12:00:00Z`).toLocaleDateString(fr ? "fr-CA" : "en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return (
    <Shell>
      <JsonLd json={articleJson(post, lang)} />
      <main className="ke-gutter mx-auto w-full max-w-3xl py-12 md:py-16" data-ke="blog-post">
        <p className="text-sm font-semibold tracking-wide text-primary">KidEase</p>
        <h1 className="mt-2 text-4xl md:text-5xl">{post.title[lang]}</h1>
        <p className="mt-3 text-sm text-muted">
          <time dateTime={post.published}>{date}</time>
        </p>
        <div className="mt-6 max-w-prose space-y-4 text-base leading-7">
          {post.paragraphs[lang].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-8">
          <Button asChild className="min-h-11 min-w-11 touch-manipulation">
            <Link to={cta.href}>{cta.label}</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm">
          <Link to={blogIndexPath(lang)} className="font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Blogue" : "Blog"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

export function MissingBlogPost() {
  const { locale } = useCopy();
  const lang = blogLocale(locale);
  const fr = lang === "fr";
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-12 md:py-16" data-ke="blog-missing">
        <h1 className="text-4xl">{fr ? "Cette note n’est pas ici" : "This note is not here"}</h1>
        <p className="mt-4 max-w-prose text-muted">
          {fr
            ? "KidEase n’a pas cette page. Retournez au blogue, à l’accueil, ou écrivez-nous."
            : "KidEase does not have this page. Go back to the blog, go home, or contact us."}
        </p>
        <div className="mt-6">
          <Button asChild className="min-h-11 min-w-11 touch-manipulation">
            <Link to={localePath("/", lang)}>{fr ? "Accueil" : "Go home"}</Link>
          </Button>
        </div>
        <p className="mt-4 text-sm">
          <Link to={blogIndexPath(lang)} className="font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Blogue" : "Blog"}
          </Link>
          {" · "}
          <Link to={localePath("/contact", lang)} className="font-medium text-primary underline-offset-4 hover:underline">
            {fr ? "Nous joindre" : "Contact us"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
