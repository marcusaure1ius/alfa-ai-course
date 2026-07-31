import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Нейрокурс — пространство курса",
  description:
    "Материалы, пояснения и учебные инструменты курса — в одном пространстве.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
