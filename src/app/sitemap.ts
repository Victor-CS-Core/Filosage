import type { MetadataRoute } from "next";
import { supportArticles } from "@/content/support/articles";
import { isQaEnvironment } from "@/lib/deployment-environment";
import { listPublicCourses } from "@/lib/firebase-server";
import { serverEnvironment } from "@/lib/runtime-environment";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isQaEnvironment(serverEnvironment)) return [];
  const base = (serverEnvironment.NEXT_PUBLIC_SITE_URL ?? "https://filosage.com").replace(/\/$/, "");
  const staticRoutes: MetadataRoute.Sitemap = ["", "/library", "/standard", "/evidence-example", "/pricing", "/support", "/terms", "/privacy", "/acceptable-use", "/copyright"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/library" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
  const supportRoutes: MetadataRoute.Sitemap = supportArticles.map((article) => ({
    url: `${base}/support/articles/${article.slug}`,
    lastModified: new Date(`${article.reviewedOn}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.45,
  }));
  const canReadProductionCatalog = Boolean(
    serverEnvironment.FIREBASE_PROJECT_ID
    && serverEnvironment.FIREBASE_CLIENT_EMAIL
    && serverEnvironment.FIREBASE_PRIVATE_KEY,
  );
  if (serverEnvironment.NODE_ENV === "production" && !canReadProductionCatalog) return [...staticRoutes, ...supportRoutes];

  try {
    const courses = await listPublicCourses();
    const courseRoutes: MetadataRoute.Sitemap = courses.flatMap((course) => {
      const id = typeof course.id === "string" ? course.id : "";
      const topic = typeof course.topic === "string" ? course.topic : "";
      if (!id || !topic) return [];
      return [{
        url: `${base}/course/${encodeURIComponent(topic)}?id=${encodeURIComponent(id)}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }];
    });
    return [...staticRoutes, ...supportRoutes, ...courseRoutes];
  } catch (error) {
    console.error("Public course sitemap expansion failed:", error);
    return [...staticRoutes, ...supportRoutes];
  }
}
