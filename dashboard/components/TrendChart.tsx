import type { TrendPoint } from "../lib/signals";

type NumericTrendKey = "new3h" | "new12h" | "cleanSignals" | "excludedTransactions";

type Series = {
  key: NumericTrendKey;
  label: string;
  className: string;
};

export function TrendChart({ data, series }: { data: TrendPoint[]; series: Series[] }) {
  if (!data.length) return <div className="trendEmpty">等待更多 observation points</div>;

  const width = 680;
  const height = 220;
  const padX = 18;
  const padY = 18;
  const values = data.flatMap((row) => series.map((item) => Number(row[item.key] || 0)));
  const max = Math.max(1, ...values);
  const x = (index: number) =>
    data.length <= 1 ? width / 2 : padX + (index / (data.length - 1)) * (width - padX * 2);
  const y = (value: number) =>
    height - padY - (value / max) * (height - padY * 2);
  const fmt = (value: string) =>
    new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));

  const labels = [data[0], data[Math.floor((data.length - 1) / 2)], data[data.length - 1]];

  return (
    <div className="trendChart">
      <div className="trendLegend">
        {series.map((item) => (
          <span key={item.key}><i className={item.className} />{item.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend line chart">
        <line className="trendGridLine" x1={padX} x2={width - padX} y1={height / 2} y2={height / 2} />
        <line className="trendGridLine" x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} />
        {series.map((item) => {
          const points = data.map((row, index) => `${x(index)},${y(Number(row[item.key] || 0))}`).join(" ");
          return <polyline key={item.key} className={`trendLine ${item.className}`} points={points} />;
        })}
      </svg>
      <div className="trendAxis">
        {labels.map((row, index) => <span key={index}>{fmt(row.runAt)}</span>)}
      </div>
    </div>
  );
}