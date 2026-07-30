import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geist = Geist({
  subsets: ["cyrillic", "latin"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["cyrillic", "latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Нейрокурс — личный кабинет",
  description:
    "Кабинеты ученика и администратора образовательной платформы Нейрокурс.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
