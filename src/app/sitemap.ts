import type { MetadataRoute } from "next";
import { listPublicCourses } from "@/lib/firebase-server";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://erudoza.com").replace(/\/$/, "");
  const staticRoutes: MetadataRoute.Sitemap = ["", "/library", "/standard", "/pricing", "/terms", "/privacy", "/acceptable-use", "/copyright"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "/library" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
  const canReadProductionCatalog = Boolean(
    process.env.FIREBASE_PROJECT_ID
    && process.env.FIREBASE_CLIENT_EMAIL
    && process.env.FIREBASE_PRIVATE_KEY,
  );
  if (process.env.NODE_ENV === "production" && !canReadProductionCatalog) return staticRoutes;

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
    return [...staticRoutes, ...courseRoutes];
  } catch (error) {
    console.error("Public course sitemap expansion failed:", error);
    return staticRoutes;
  }
}
