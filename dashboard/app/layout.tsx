import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "../components/I18nProvider";
import { GlobalDashboardBar } from "../components/GlobalDashboardBar";

export const metadata: Metadata = {
  title: "Next Stop Live — Dashboard",
  description: "Observation, review, connections, and collector health for Next Stop Live."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body>
        <I18nProvider>
          <GlobalDashboardBar />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
