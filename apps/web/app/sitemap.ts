import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site/base-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteBaseUrl();
  const now = new Date();

  const paths = [
    "",
    "/home",
    "/login",
    "/register",
    "/offer",
    "/privacy",
    "/personal-data"
  ];

  return paths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/home" ? "weekly" : "monthly",
    priority: path === "/home" || path === "" ? 1 : 0.7
  }));
}
