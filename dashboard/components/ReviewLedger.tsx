"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import { useRouter } from "next/navigation";
import type { DeidentifiedReviewRow } from "../lib/reviewLedger";
import { REVIEW_CATEGORIES } from "../lib/reviewCategories";
import { useI18n } from "./I18nProvider";

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

export function ReviewLedger({ rows }: { rows: DeidentifiedReviewRow[] }) {
  const {t,formatDate,dataLabel}=useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState(rows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  useEffect(() => {
    setItems(rows);
  }, [rows]);

  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

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
        headers: {
          "Content-Type": "application/json",
          "X-NextStop-Write-Intent": "human-review"
        },
        body: JSON.stringify({ category })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || t("reviews.categorySaveFailed"));

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
      setSaveMessage(t("reviews.saved"));
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : t("reviews.categorySaveFailed"));
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
        headers: {
          "Content-Type": "application/json",
          "X-NextStop-Write-Intent": "human-review"
        },
        body: JSON.stringify({ label: nextLabel })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || t("reviews.labelSaveFailed"));

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
      setSaveMessage(t("reviews.saved"));
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : t("reviews.labelSaveFailed")
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
            {key === "all" ? t("reviews.filter.all") : key === "relevant" ? t("deck.relevant") : t("deck.irrelevant")}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="reviewPrivacyNote">
        {t("reviews.privacy")}
        <span className="reviewSyncNote">
          {t("reviews.syncNote")}
        </span>
        {saveMessage ? <strong className="reviewSaveMessage">{saveMessage}</strong> : null}
      </div>

      <div className="reviewTableScroll">
        <table className="reviewDataTable">
          <thead>
            <tr>
              <th>{t("reviews.header.label")}</th>
              <th>{t("reviews.header.signal")}</th>
              <th>{t("reviews.header.category")}</th>
              <th>{t("reviews.header.content")}</th>
              <th>{t("reviews.header.review")}</th>
              <th>{t("reviews.header.source")}</th>
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
                      {row.label === "relevant" ? t("deck.relevant") : t("deck.irrelevant")}
                    </span>
                    {row.original_label && row.original_label !== row.label ? (
                      <small className="reviewLabelCorrection">{t("reviews.humanCorrection")}</small>
                    ) : null}
                  </td>
                  <td><code>{row.anonymous_id}</code></td>
                  <td>
                    <label className="reviewCategoryEditor">
                      <span className="srOnly">{t("reviews.adjustCategory")}</span>
                      <select
                        value={dataLabel(row.category)}
                        disabled={savingId === row.anonymous_id}
                        onChange={(event) => void updateCategory(row, event.target.value)}
                      >
                        {!REVIEW_CATEGORIES.includes(row.category as any) ? (
                          <option value={row.category}>{row.category}</option>
                        ) : null}
                        {REVIEW_CATEGORIES.map((category) => (
                          <option key={dataLabel(category)} value={category}>{dataLabel(category)}</option>
                        ))}
                      </select>
                    </label>
                    <small>
                      {row.window}
                      {row.category_source === "human_override" ? " · "+t("reviews.humanCorrection") : " · "+t("reviews.systemPreset")}
                    </small>
                    {row.category_source === "human_override" &&
                    row.original_category &&
                    row.original_category !== row.category ? (
                      <small className="reviewOriginalCategory">
                        {t("reviews.original",{value:row.original_category})}
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
                        aria-label={t("reviews.swipeAria")}
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
                          {t("reviews.swipeHelp")}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <small>{formatDate(row.reviewed_at)}</small>
                    {row.label_updated_at ? (
                      <small>{t("reviews.correctedAt",{date:formatDate(row.label_updated_at)})}</small>
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
          <div className="reviewEmpty">{t("reviews.empty")}</div>
        ) : null}
      </div>

      {undo ? (
        <div className="reviewUndoToast" role="status" aria-live="polite">
          <span>
            {t("reviews.changedTo",{label:undo.nextLabel === "relevant" ? t("deck.relevant") : t("deck.irrelevant")})}
          </span>
          <button type="button" disabled={Boolean(savingId)} onClick={() => void undoLabel()}>
            {t("reviews.undo")}
          </button>
        </div>
      ) : null}
    </>
  );
}
