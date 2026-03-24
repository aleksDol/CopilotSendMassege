"use client";

import Link, { type LinkProps } from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "gclid",
  "fbclid",
  "yclid",
  "rb_clickid",
  "_openstat",
  "from",
  "ref"
];

function mergeTrackingIntoHref(href: string, searchParams: URLSearchParams): string {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//")) {
    return href;
  }
  if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return href;
  }

  const dummy = "https://internal.local";
  let url: URL;
  try {
    url = new URL(href, dummy);
  } catch {
    return href;
  }

  for (const key of TRACKING_KEYS) {
    const value = searchParams.get(key);
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  const path = url.pathname + (url.search ? `?${url.searchParams.toString()}` : "") + url.hash;
  return path.startsWith("//") ? path.slice(1) : path;
}

type TrackingLinkProps = Omit<LinkProps, "href"> & {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export function TrackingLink({ href, ...props }: TrackingLinkProps) {
  const searchParams = useSearchParams();
  const mergedHref = useMemo(() => mergeTrackingIntoHref(href, searchParams), [href, searchParams]);

  return <Link href={mergedHref} {...props} />;
}
