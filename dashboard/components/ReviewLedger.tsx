"use client";

import { useMemo, useState } from "react";
import type { DeidentifiedReviewRow } from "../lib/reviewLedger";
import { REVIEW_CATEGORIES } from "../lib/reviewCategories";

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
  const [items, setItems] = useState(rows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  const counts = useMemo(
    () => ({
      all: items.length,
      relevant: items.filter((row) => row.label === "relevant").length,
      irrelevant: items.filter((row) => row.label === "irrelevant").length
    }),
    [items]
  );

  const visible = useMemo(
    () => items.filter((row) => filter === "all" || row.label === filter),
    [items, filter]
  );


  async function updateCategory(row: DeidentifiedReviewRow, category: string) {
    if (category === row.category || savingId) return;
    setSavingId(row.anonymous_id);
    setSaveMessage("");

    try {
      const response = await fetch("/api/reviews/category/" + row.anonymous_id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "分类保存失败");

      setItems((current) =>
        current.map((item) =>
          item.anonymous_id === row.anonymous_id
            ? {
                ...item,
                category: payload.category,
                original_category: payload.original_category || item.original_category || row.category,
                category_source: payload.category_source || "human_override",
                category_updated_at: payload.category_updated_at || new Date().toISOString()
              }
            : item
        )
      );
      setSaveMessage("已即时保存 · 将于 00:00 自动归档到 GitHub");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "分类保存失败");
    } finally {
      setSavingId(null);
    }
  }

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
        <span className="reviewSyncNote">類型修改會即時保存；00:00 Asia/Taipei 自動寫入 GitHub archive，並沿用現有 Notion 日結同步。</span>
        {saveMessage ? <strong className="reviewSaveMessage">{saveMessage}</strong> : null}
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
                  <label className="reviewCategoryEditor">
                    <span className="srOnly">调整类型</span>
                    <select
                      value={row.category}
                      disabled={savingId === row.anonymous_id}
                      onChange={(event) => void updateCategory(row, event.target.value)}
                    >
                      {!REVIEW_CATEGORIES.includes(row.category as any) ? (
                        <option value={row.category}>{row.category}</option>
                      ) : null}
                      {REVIEW_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <small>
                    {row.window}
                    {row.category_source === "human_override" ? " · 人工修正" : " · 系統預標"}
                  </small>
                  {row.category_source === "human_override" && row.original_category && row.original_category !== row.category ? (
                    <small className="reviewOriginalCategory">原：{row.original_category}</small>
                  ) : null}
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
