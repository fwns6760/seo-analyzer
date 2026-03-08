import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Analyzer",
  description: "yoshilover.com SEO analysis dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
