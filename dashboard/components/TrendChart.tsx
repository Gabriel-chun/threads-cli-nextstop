"use client";

import { trendSegments } from "../lib/collectorQuality";
import type { TrendPoint } from "../lib/signals";
import { useI18n } from "./I18nProvider";

type NumericTrendKey = "new3h" | "new12h" | "cleanSignals" | "excludedTransactions";

type Series = {
  key: NumericTrendKey;
  labelKey: string;
  className: string;
};

export function TrendChart({
  data,
  series,
  compact = false
}: {
  data: TrendPoint[];
  series: Series[];
  compact?: boolean;
}) {
  const {t,formatDate}=useI18n();
  if (!data.length) return <div className={compact ? "trendEmpty compact" : "trendEmpty"}>{t("signal.chart.empty")}</div>;

  const width = 680;
  const height = compact ? 104 : 220;
  const padX = 18;
  const padY = compact ? 10 : 18;
  const values = data.filter(row => row.sourceUsable).flatMap((row) => series.map((item) => row[item.key])).filter(Number.isFinite);
  const max = Math.max(1, ...values);
  const firstTime = Date.parse(data[0].runAt);
  const lastTime = Date.parse(data[data.length - 1].runAt);
  const x = (row: TrendPoint) => lastTime <= firstTime ? width / 2
    : padX + ((Date.parse(row.runAt) - firstTime) / (lastTime - firstTime)) * (width - padX * 2);
  const y = (value: number) =>
    height - padY - (value / max) * (height - padY * 2);

  const labels = [data[0], data[Math.floor((data.length - 1) / 2)], data[data.length - 1]];

  return (
    <div className={compact ? "trendChart compact" : "trendChart"}>
      <div className="trendLegend">
        {series.map((item) => (
          <span key={item.key}><i className={item.className} />{t(item.labelKey)}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("signal.chart.aria")}>
        {!compact ? <line className="trendGridLine" x1={padX} x2={width - padX} y1={height / 2} y2={height / 2} /> : null}
        <line className="trendGridLine" x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} />
        <desc>{t("signal.chart.gaps")}</desc>
        {series.flatMap((item) => trendSegments(data, row => row[item.key]).map((segment, index) => (
          <g key={`${item.key}-${index}`}>
            <polyline className={`trendLine ${item.className}`} points={segment.map(row => `${x(row)},${y(row[item.key])}`).join(" ")} />
            {segment.length === 1 ? <circle className={`trendLine ${item.className}`} cx={x(segment[0])} cy={y(segment[0][item.key])} r={2.5} /> : null}
          </g>
        )))}
      </svg>
      <p className="quietTrendExplainer">{t("signal.chart.gaps")}</p>
      <div className="trendAxis">
        {labels.map((row, index) => <span key={index}>{formatDate(row.runAt)}</span>)}
      </div>
    </div>
  );
}
