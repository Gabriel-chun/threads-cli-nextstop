"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import type { DeidentifiedReviewRow } from "../lib/reviewLedger";
import { REVIEW_CATEGORIES } from "../lib/reviewCategories";

type Filter = "all" | "relevant" | "irrelevant";
type ReviewLabel = "relevant" | "irrelevant";

type DragState = {
  anonymousId: string;
  pointerId: number;
  startX: number;
  currentX: number;
};

type UndoState = {
  anonymousId: string;
  previousLabel: ReviewLabel;
  nextLabel: ReviewLabel;
};

const SWIPE_THRESHOLD = 72;

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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

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
      if (!response.ok) throw new Error(payload?.error || "分類保存失敗");

      setItems((current) =>
        current.map((item) =>
          item.anonymous_id === row.anonymous_id
            ? {
                ...item,
                category: payload.category,
                original_category:
                  payload.original_category || item.original_category || row.category,
                category_source: payload.category_source || "human_override",
                category_updated_at:
                  payload.category_updated_at || new Date().toISOString()
              }
            : item
        )
      );
      setSaveMessage("已即時保存 · 將於 00:00 自動歸檔到 GitHub");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "分類保存失敗");
    } finally {
      setSavingId(null);
    }
  }

  async function updateLabel(
    row: DeidentifiedReviewRow,
    nextLabel: ReviewLabel,
    allowUndo = true
  ) {
    if (nextLabel === row.label || savingId) return;
    const previousLabel = row.label;
    setSavingId(row.anonymous_id);
    setSaveMessage("");

    try {
      const response = await fetch("/api/reviews/label/" + row.anonymous_id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Relevant / Irrelevant 修正失敗");

      setItems((current) =>
        current.map((item) =>
          item.anonymous_id === row.anonymous_id
            ? {
                ...item,
                label: payload.label,
                original_label:
                  payload.original_label || item.original_label || previousLabel,
                label_updated_at:
                  payload.label_updated_at || new Date().toISOString()
              }
            : item
        )
      );

      if (allowUndo) {
        setUndo({
          anonymousId: row.anonymous_id,
          previousLabel,
          nextLabel
        });
      } else {
        setUndo(null);
      }
      setSaveMessage("已即時保存 · 將於 00:00 自動歸檔到 GitHub");
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Relevant / Irrelevant 修正失敗"
      );
    } finally {
      setSavingId(null);
    }
  }

  async function undoLabel() {
    if (!undo || savingId) return;
    const row = items.find((item) => item.anonymous_id === undo.anonymousId);
    if (!row) {
      setUndo(null);
      return;
    }
    await updateLabel(row, undo.previousLabel, false);
  }

  function pointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    row: DeidentifiedReviewRow
  ) {
    if (savingId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      anonymousId: row.anonymous_id,
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX
    });
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag((current) =>
      current ? { ...current, currentX: event.clientX } : current
    );
  }

  function finishDrag(row: DeidentifiedReviewRow, dx: number) {
    setDrag(null);
    if (dx <= -SWIPE_THRESHOLD && row.label !== "irrelevant") {
      void updateLabel(row, "irrelevant");
    } else if (dx >= SWIPE_THRESHOLD && row.label !== "relevant") {
      void updateLabel(row, "relevant");
    }
  }

  function pointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
    row: DeidentifiedReviewRow
  ) {
    if (!drag || drag.pointerId !== event.pointerId) {
      setDrag(null);
      return;
    }
    finishDrag(row, event.clientX - drag.startX);
  }

  function pointerCancel() {
    setDrag(null);
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
        <span className="reviewSyncNote">
          左滑 = Irrelevant、右滑 = Relevant；類型下拉框只調整 category。所有修正會即時保存，00:00 Asia/Taipei 才自動寫入 GitHub archive，並沿用 Notion 日結同步。
        </span>
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
            {visible.map((row) => {
              const dragging = drag?.anonymousId === row.anonymous_id;
              const dx = dragging && drag ? drag.currentX - drag.startX : 0;
              const visualDx = Math.max(-120, Math.min(120, dx));

              return (
                <tr key={row.anonymous_id}>
                  <td>
                    <span className={"reviewLabel " + row.label}>
                      {row.label === "relevant" ? "Relevant" : "Irrelevant"}
                    </span>
                    {row.original_label && row.original_label !== row.label ? (
                      <small className="reviewLabelCorrection">人工修正</small>
                    ) : null}
                  </td>
                  <td><code>{row.anonymous_id}</code></td>
                  <td>
                    <label className="reviewCategoryEditor">
                      <span className="srOnly">調整類型</span>
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
                    {row.category_source === "human_override" &&
                    row.original_category &&
                    row.original_category !== row.category ? (
                      <small className="reviewOriginalCategory">
                        原：{row.original_category}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <div className="reviewSwipeCell">
                      <div className={"reviewSwipeHint reviewSwipeHintLeft " + (dx <= -SWIPE_THRESHOLD ? "active" : "")}>
                        Irrelevant
                      </div>
                      <div className={"reviewSwipeHint reviewSwipeHintRight " + (dx >= SWIPE_THRESHOLD ? "active" : "")}>
                        Relevant
                      </div>
                      <div
                        className={"reviewSwipeSurface " + (dragging ? "dragging" : "")}
                        style={{ transform: `translate3d(${visualDx}px, 0, 0)` }}
                        role="group"
                        aria-label="左滑 Irrelevant，右滑 Relevant"
                        onPointerDown={(event) => pointerDown(event, row)}
                        onPointerMove={pointerMove}
                        onPointerUp={(event) => pointerUp(event, row)}
                        onPointerCancel={pointerCancel}
                      >
                        <p className="reviewExcerpt">{row.excerpt || "—"}</p>
                        {row.feature_tags.length ? (
                          <div className="reviewTags">
                            {row.feature_tags.slice(0, 4).map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                          </div>
                        ) : null}
                        <small className="reviewSwipeHelp">
                          左滑 Irrelevant · 右滑 Relevant
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <small>{fmtDate(row.reviewed_at)}</small>
                    {row.label_updated_at ? (
                      <small>修正 {fmtDate(row.label_updated_at)}</small>
                    ) : null}
                  </td>
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
              );
            })}
          </tbody>
        </table>
        {!visible.length ? (
          <div className="reviewEmpty">目前沒有這個分類的 review。</div>
        ) : null}
      </div>

      {undo ? (
        <div className="reviewUndoToast" role="status" aria-live="polite">
          <span>
            已改為 {undo.nextLabel === "relevant" ? "Relevant" : "Irrelevant"}
          </span>
          <button type="button" disabled={Boolean(savingId)} onClick={() => void undoLabel()}>
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}
