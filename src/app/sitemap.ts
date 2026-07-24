import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://erudoza.app").replace(/\/$/, "");
  return ["", "/library", "/pricing", "/terms", "/privacy", "/acceptable-use", "/copyright"].map((path) => ({ url: `${base}${path}`, changeFrequency: path === "/library" ? "daily" : "monthly", priority: path === "" ? 1 : 0.5 }));
}
