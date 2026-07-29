import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erudoza.com";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/create", "/evidence/", "/privacy-center", "/profile", "/progress", "/review"] }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
}
