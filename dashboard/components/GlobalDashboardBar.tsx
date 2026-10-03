"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";

const links=[{href:"/",key:"nav.signalDesk"},{href:"/network",key:"nav.keywordNetwork"},{href:"/trends",key:"nav.trendObservation"},{href:"/reviews",key:"nav.reviewLedger"}];
export function GlobalDashboardBar(){
  const pathname=usePathname();
  const {locale,setLocale,t}=useI18n();
  return <div className="dashboardGlobalBar">
    <nav className="dashboardGlobalNav" aria-label={t("common.dashboardNav")}>
      {links.map(link=><a key={link.href} href={link.href} className={pathname===link.href?"active":""}>{t(link.key)}</a>)}
    </nav>
    <div className="languageSegment" role="group" aria-label={t("common.language")}>
      <button type="button" className={locale==="zh-TW"?"active":""} onClick={()=>setLocale("zh-TW")}>{t("language.zh")}</button>
      <span>|</span>
      <button type="button" className={locale==="en"?"active":""} onClick={()=>setLocale("en")}>{t("language.en")}</button>
    </div>
  </div>;
}
