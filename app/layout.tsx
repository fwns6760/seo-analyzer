import type { Metadata } from "next";
import { appConfig } from "@/utils/runtime-config";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.appName,
  description: appConfig.description,
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
