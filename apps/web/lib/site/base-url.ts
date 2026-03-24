/**
 * Canonical site origin for sitemap, robots, and metadata (no trailing slash).
 */
export function getSiteBaseUrl(): string {
  const fromPublic = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (fromPublic) {
    return fromPublic.replace(/\/$/, "");
  }
  const fromApp = process.env.APP_BASE_URL?.trim();
  if (fromApp) {
    return fromApp.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/\/$/, "");
    return host.startsWith("http") ? host : `https://${host}`;
  }
  return "http://localhost:3000";
}
