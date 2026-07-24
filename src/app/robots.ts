import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erudoza.app";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/create", "/profile", "/progress", "/review"] }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
}
