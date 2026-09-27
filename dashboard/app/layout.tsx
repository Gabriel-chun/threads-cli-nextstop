import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Stop Live — Signal Desk",
  description: "Concert demand signals, venue context, and collector health."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
