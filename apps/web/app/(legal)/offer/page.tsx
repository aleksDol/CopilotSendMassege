import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { OfferContent } from "@/components/legal/content/offer-content";
import { SERVICE_DISPLAY_NAME } from "@/lib/constants/service";

const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
const canonicalUrl = `${baseUrl}/offer`;

export const metadata: Metadata = {
  title: `Оферта — ${SERVICE_DISPLAY_NAME}`,
  description: `Публичная оферта на оказание услуг ${SERVICE_DISPLAY_NAME}.`,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: canonicalUrl,
    title: `Оферта — ${SERVICE_DISPLAY_NAME}`,
    description: `Публичная оферта на оказание услуг ${SERVICE_DISPLAY_NAME}.`
  },
  robots: { index: true, follow: true }
};

export default function OfferPage() {
  return (
    <LegalPageLayout
      title="Публичная оферта"
      subtitle="на оказание услуг доступа к программному обеспечению"
    >
      <OfferContent />
    </LegalPageLayout>
  );
}
