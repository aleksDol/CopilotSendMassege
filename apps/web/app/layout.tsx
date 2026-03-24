import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { TopMailRu } from "@/components/analytics/top-mail-ru";

const sansFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "AI Sales Assistant",
  description: "AI Sales Assistant for Telegram Chats"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sansFont.variable} ${monoFont.variable}`}>
        <AppProviders>{children}</AppProviders>
        <YandexMetrika />
        <TopMailRu />
      </body>
    </html>
  );
}
