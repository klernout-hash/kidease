import { createFileRoute, notFound } from "@tanstack/react-router";
import { BlogArticle, MissingBlogPost } from "@/components/blog-pages";
import { blogPost, blogPostPath } from "@/lib/blog-posts";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/blog_/$slug")({
  loader: ({ params }) => {
    const post = blogPost(params.slug);
    if (!post) throw notFound();
    return { slug: post.slug };
  },
  head: ({ params }) => {
    const post = blogPost(params.slug);
    if (!post) return { meta: [{ title: "Blogue · KidEase" }] };
    return pageSeoHead({
      title: `${post.title.fr} · KidEase`,
      description: post.description.fr,
      path: blogPostPath(post.slug, "fr"),
      ogType: "article",
    });
  },
  component: FrBlogArticleRoute,
  notFoundComponent: MissingBlogPost,
});

function FrBlogArticleRoute() {
  const { slug } = Route.useParams();
  return <BlogArticle slug={slug} />;
}
