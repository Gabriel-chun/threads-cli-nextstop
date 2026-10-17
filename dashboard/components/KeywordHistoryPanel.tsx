"use client";

import type { KeywordNetworkOverlay } from "../lib/keywordNetworkHistory";
import { networkEdgeKey } from "../lib/keywordNetworkHistory";
import { useI18n } from "./I18nProvider";

export function KeywordHistoryPanel({overlay}:{overlay:KeywordNetworkOverlay}) {
  const {t}=useI18n();
  const names=new Map(overlay.graph.nodes.map(node=>[node.id,node.label]));
  return <section className="keywordTracking">
    <div className="keywordTrackingHead">
      <h2>{t("network.trackingTitle")}</h2>
      <small>{t("network.sumDisclaimer")}</small>
    </div>
    <div className="quietStats keywordTrackingSummary">
      <span><strong>{overlay.sourceCardTotal}</strong> {t("network.sourceCardsTotal")}</span>
      <span><strong>{overlay.trackedEdges.length}</strong> {t("network.distinctEdges")}</span>
      <span><strong>{overlay.repeatedEdges}</strong> {t("network.repeatedEdges")}</span>
    </div>
    <div className="keywordTrackingTableScroll">
      <table className="keywordTrackingTable">
        <thead><tr>
          <th>{t("network.day")}</th>
          <th>{t("network.metric.sourceCards")}</th>
          <th>{t("network.metric.nodes")}</th>
          <th>{t("network.metric.edges")}</th>
          <th>{t("network.firstSeen")}</th>
          <th>{t("network.revisited")}</th>
        </tr></thead>
        <tbody>{[...overlay.daily].reverse().map(row=><tr key={row.date} className={!row.available?"missing":""}>
          <td>{row.date.slice(5).replace("-","/")}</td>
          {row.available?<><td>{row.sourceCards}</td><td>{row.nodes}</td><td>{row.edges}</td><td>{row.firstSeen}</td><td>{row.revisited}</td></>:<td colSpan={5}>{t("network.missingSnapshot")}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    <h3>{t("network.connectionOverlay")}</h3>
    <div className="keywordTrackingTableScroll">
      <table className="keywordTrackingTable">
        <thead><tr><th>{t("network.connection")}</th><th>{t("network.weightTotal")}</th><th>{t("network.daysPresent")}</th><th>{t("network.dailyOverlay")}</th></tr></thead>
        <tbody>{overlay.trackedEdges.slice(0,24).map(edge=><tr key={networkEdgeKey(edge)}>
          <td>{names.get(edge.source)||edge.source} → {names.get(edge.target)||edge.target}</td>
          <td>{edge.weight}</td>
          <td>{edge.daysPresent}/{overlay.loadedDays}</td>
          <td><div className="keywordDayBars">{overlay.dates.map(date=><span key={date}
            aria-label={date+": "+(overlay.daily.find(row=>row.date===date)?.available?String(edge.dailyWeights[date]||0):t("network.missingSnapshot"))}
            title={date+": "+(overlay.daily.find(row=>row.date===date)?.available?String(edge.dailyWeights[date]||0):t("network.missingSnapshot"))}
            className={overlay.daily.find(row=>row.date===date)?.available?"":"missing"}
            style={{height:Math.max(3,Math.min(32,(edge.dailyWeights[date]||0)*5))+"px"}}/>)}</div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
