import { supportArticles } from "@/content/support/articles";
import { getSupportCategory } from "@/content/support/categories";

export async function GET() {
  const articles = supportArticles.map((article) => ({
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    category: getSupportCategory(article.category)?.label ?? article.category,
    keywords: article.keywords,
    featured: article.featured === true,
  }));
  return Response.json(
    { articles },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
