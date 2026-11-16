import { createFileRoute, notFound } from "@tanstack/react-router";
import { BlogArticle, MissingBlogPost } from "@/components/blog-pages";
import { blogPost, blogPostPath } from "@/lib/blog-posts";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/blog_/$slug")({
  loader: ({ params }) => {
    const post = blogPost(params.slug);
    if (!post) throw notFound();
    return { slug: post.slug };
  },
  head: ({ params }) => {
    const post = blogPost(params.slug);
    if (!post) return { meta: [{ title: "Blog · KidEase" }] };
    return pageSeoHead({
      title: `${post.title.en} · KidEase`,
      description: post.description.en,
      path: blogPostPath(post.slug, "en"),
      ogType: "article",
    });
  },
  component: BlogArticleRoute,
  notFoundComponent: MissingBlogPost,
});

function BlogArticleRoute() {
  const { slug } = Route.useParams();
  return <BlogArticle slug={slug} />;
}
