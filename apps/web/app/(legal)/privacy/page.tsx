import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PrivacyContent } from "@/components/legal/content/privacy-content";
import { SERVICE_DISPLAY_NAME } from "@/lib/constants/service";

const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
const canonicalUrl = `${baseUrl}/privacy`;

export const metadata: Metadata = {
  title: `Политика конфиденциальности — ${SERVICE_DISPLAY_NAME}`,
  description: `Политика конфиденциальности и обработки данных сервиса ${SERVICE_DISPLAY_NAME}.`,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: canonicalUrl,
    title: `Политика конфиденциальности — ${SERVICE_DISPLAY_NAME}`,
    description: `Политика конфиденциальности и обработки данных сервиса ${SERVICE_DISPLAY_NAME}.`
  },
  robots: { index: true, follow: true }
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="Политика конфиденциальности"
      subtitle="Порядок обработки персональных данных в соответствии с Федеральным законом № 152-ФЗ."
    >
      <PrivacyContent />
    </LegalPageLayout>
  );
}
