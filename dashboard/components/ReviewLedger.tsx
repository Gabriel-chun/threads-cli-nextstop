"use client";

import { useMemo, useState } from "react";
import type { DeidentifiedReviewRow } from "../lib/reviewLedger";

type Filter = "all" | "relevant" | "irrelevant";

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function ReviewLedger({ rows }: { rows: DeidentifiedReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: rows.length,
      relevant: rows.filter((row) => row.label === "relevant").length,
      irrelevant: rows.filter((row) => row.label === "irrelevant").length
    }),
    [rows]
  );

  const visible = useMemo(
    () => rows.filter((row) => filter === "all" || row.label === filter),
    [rows, filter]
  );

  return (
    <>
      <div className="reviewFilterBar" aria-label="Review filter">
        {(["all", "relevant", "irrelevant"] as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={filter === key ? "active" : ""}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "全部" : key === "relevant" ? "Relevant" : "Irrelevant"}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="reviewPrivacyNote">
        去識別化檢視：不顯示 username、post ID 或 post key；文字中的 @handle 會遮罩。原始 Threads 連結保留作 evidence provenance。
      </div>

      <div className="reviewTableScroll">
        <table className="reviewDataTable">
          <thead>
            <tr>
              <th>分類</th>
              <th>Signal</th>
              <th>類型</th>
              <th>去識別化內容</th>
              <th>Review</th>
              <th>來源</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.anonymous_id}>
                <td>
                  <span className={"reviewLabel " + row.label}>
                    {row.label === "relevant" ? "Relevant" : "Irrelevant"}
                  </span>
                </td>
                <td><code>{row.anonymous_id}</code></td>
                <td>
                  <strong className="reviewCategory">{row.category}</strong>
                  <small>{row.window}</small>
                </td>
                <td>
                  <p className="reviewExcerpt">{row.excerpt || "—"}</p>
                  {row.feature_tags.length ? (
                    <div className="reviewTags">
                      {row.feature_tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
                </td>
                <td><small>{fmtDate(row.reviewed_at)}</small></td>
                <td>
                  {row.evidence_url ? (
                    <a
                      className="reviewSourceLink"
                      href={row.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Threads ↗
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length ? <div className="reviewEmpty">目前沒有這個分類的 review。</div> : null}
      </div>
    </>
  );
}
