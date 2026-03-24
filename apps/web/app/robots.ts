import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site/base-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/chats",
          "/dashboard",
          "/getting-started",
          "/onboarding",
          "/settings",
          "/tasks"
        ]
      }
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base
  };
}
