"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";

const primaryLinks = [
  { href: "/", key: "nav.signalDesk" },
  { href: "/trends", key: "nav.trendObservation" },
  { href: "/reviews", key: "nav.reviewLedger" }
];

const researchLinks = [
  { href: "/network", key: "nav.keywordNetwork" },
  { href: "/trends?view=observation", key: "trend.tab.observation" },
  { href: "/trends?view=connections", key: "trend.tab.connections" },
  { href: "/trends?view=eventWatch", key: "trend.tab.eventWatch" },
  { href: "/?details=1#system-details", key: "nav.systemDetails" }
];

export function GlobalDashboardBar() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();
  return <div className="dashboardGlobalBar">
    <nav className="dashboardGlobalNav" aria-label={t("common.dashboardNav")}>
      {primaryLinks.map(link => <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""} aria-current={pathname === link.href ? "page" : undefined}>{t(link.key)}</a>)}
    </nav>
    <div className="dashboardGlobalActions">
      <details className="dashboardMoreMenu">
        <summary className={pathname === "/network" ? "active" : ""}>{t("nav.researchSystem")}</summary>
        <nav className="dashboardMorePanel" aria-label={t("nav.researchSystem")}>
          {researchLinks.map(link => <a key={link.href} href={link.href} aria-current={pathname === "/network" && link.href === "/network" ? "page" : undefined}>{t(link.key)}</a>)}
        </nav>
      </details>
      <div className="languageSegment" role="group" aria-label={t("common.language")}>
        <button type="button" className={locale === "zh-TW" ? "active" : ""} onClick={() => setLocale("zh-TW")}>{t("language.zh")}</button>
        <span>|</span>
        <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>{t("language.en")}</button>
      </div>
    </div>
  </div>;
}
