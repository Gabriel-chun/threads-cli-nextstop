"use client";

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
  const values = data.flatMap((row) => series.map((item) => Number(row[item.key] || 0)));
  const max = Math.max(1, ...values);
  const x = (index: number) =>
    data.length <= 1 ? width / 2 : padX + (index / (data.length - 1)) * (width - padX * 2);
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
        {series.map((item) => {
          const points = data.map((row, index) => `${x(index)},${y(Number(row[item.key] || 0))}`).join(" ");
          return <polyline key={item.key} className={`trendLine ${item.className}`} points={points} />;
        })}
      </svg>
      <div className="trendAxis">
        {labels.map((row, index) => <span key={index}>{formatDate(row.runAt)}</span>)}
      </div>
    </div>
  );
}
