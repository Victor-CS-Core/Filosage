import type { MetadataRoute } from "next";
import { serverEnvironment } from "@/lib/runtime-environment";

export default function robots(): MetadataRoute.Robots {
  const base = serverEnvironment.NEXT_PUBLIC_SITE_URL ?? "https://filosage.com";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/create", "/evidence/", "/privacy-center", "/profile", "/progress", "/review"] }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
}
