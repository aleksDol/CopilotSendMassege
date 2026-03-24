import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PersonalDataContent } from "@/components/legal/content/personal-data-content";
import { SERVICE_DISPLAY_NAME } from "@/lib/constants/service";

const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
const canonicalUrl = `${baseUrl}/personal-data`;

export const metadata: Metadata = {
  title: `Обработка персональных данных — ${SERVICE_DISPLAY_NAME}`,
  description: `Согласие и условия обработки персональных данных в сервисе ${SERVICE_DISPLAY_NAME}.`,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: canonicalUrl,
    title: `Обработка персональных данных — ${SERVICE_DISPLAY_NAME}`,
    description: `Согласие и условия обработки персональных данных в сервисе ${SERVICE_DISPLAY_NAME}.`
  },
  robots: { index: true, follow: true }
};

export default function PersonalDataPage() {
  return (
    <LegalPageLayout
      title="Согласие на обработку персональных данных"
      subtitle="Правовая основа и цели обработки персональных данных при использовании сервиса."
    >
      <PersonalDataContent />
    </LegalPageLayout>
  );
}
