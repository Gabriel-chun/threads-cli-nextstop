"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useState
} from "react";
import type {
  SignalDeck,
  SignalPostCard,
  TriageLabel
} from "../lib/signalDeck";
import {
  buildReviewBatch,
  nextUnreviewedKeys,
  remainingUnreviewedCount
} from "../lib/reviewQuota";

type WindowKey = "1d" | "3d" | "5d";
type DragState = {
  postKey: string;
  pointerId: number;
  startX: number;
  currentX: number;
};

const SWIPE_THRESHOLD = 86;

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

function PostCard({
  card,
  index,
  selected,
  drag,
  stacked,
  interactive,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onOpen
}: {
  card: SignalPostCard;
  index: number;
  selected: boolean;
  drag: DragState | null;
  stacked: boolean;
  interactive: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, card: SignalPostCard) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>, card: SignalPostCard) => void;
  onPointerCancel: () => void;
  onOpen: () => void;
}) {
  const dragging = Boolean(drag && drag.postKey === card.post_key);
  const dx = drag && dragging ? drag.currentX - drag.startX : 0;
  const visualDx = Math.max(-150, Math.min(150, dx));
  const style = dragging
    ? {
        transform: stacked
          ? `translate3d(calc(-50% + ${visualDx}px), -6px, 0) rotate(${visualDx / 28}deg)`
          : `translate3d(${visualDx}px, -6px, 0) rotate(${visualDx / 28}deg)`
      }
    : undefined;

  return (
    <div
      className={`reelCard postCard reelCard${index % 5} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""} ${card.triage_label || ""}`}
      style={style}
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-expanded={selected}
      aria-label={`${card.category}，${card.summary}`}
      onPointerDown={(event) => onPointerDown(event, card)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerUp(event, card)}
      onPointerCancel={onPointerCancel}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="reelCardTop">
        <span className={`reelKind ${card.kind}`}>{card.category}</span>
        <span className="reelStatus">
          <i />
          {card.triage_label === "relevant"
            ? "Relevant"
            : card.triage_label === "irrelevant"
              ? "Irrelevant"
              : card.status}
        </span>
      </div>

      <p className="postCardText">{card.summary}</p>

      <div className="postCardMeta">
        <span>@{card.username || "unknown"}</span>
        <span>{fmtDate(card.posted_at)}</span>
      </div>

      <div className="reelPeek">
        <small>點一下看完整內容 · 左拖 Irrelevant · 右拖 Relevant</small>
      </div>
    </div>
  );
}

export function SignalReel({ deck }: { deck: SignalDeck }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("3d");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [labels, setLabels] = useState<Record<string, TriageLabel | null>>(
    Object.fromEntries(
      Object.values(deck.windows)
        .flatMap((window) => window.cards)
        .map((card) => [card.post_key, card.triage_label || null])
    )
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const baseReviewLimits: Record<WindowKey, number> = {
    "1d": deck.windows["1d"].default_review_limit ?? Math.min(40, deck.windows["1d"].card_count),
    "3d": deck.windows["3d"].default_review_limit ?? Math.min(40, deck.windows["3d"].card_count),
    "5d": deck.windows["5d"].default_review_limit ?? Math.min(40, deck.windows["5d"].card_count)
  };
  const [extraReviewKeys, setExtraReviewKeys] = useState<Record<WindowKey, string[]>>({
    "1d": [],
    "3d": [],
    "5d": []
  });

  const window = deck.windows[windowKey];
  const baseReviewLimit = Math.min(baseReviewLimits[windowKey], window.card_count);

  const windowCards = useMemo(
    () =>
      window.cards.map((card) => ({
        ...card,
        triage_label: labels[card.post_key] ?? card.triage_label ?? null
      })),
    [window.cards, labels]
  );

  const cards = useMemo(
    () => buildReviewBatch(windowCards, baseReviewLimit, extraReviewKeys[windowKey]),
    [windowCards, baseReviewLimit, extraReviewKeys, windowKey]
  );

  const remainingUnreviewed = useMemo(
    () => remainingUnreviewedCount(windowCards, baseReviewLimit, extraReviewKeys[windowKey]),
    [windowCards, baseReviewLimit, extraReviewKeys, windowKey]
  );

  const currentRemaining = cards.filter((card) => !card.triage_label).length;
  const currentProgressPct = cards.length
    ? ((cards.length - currentRemaining) / cards.length) * 100
    : 100;
  const currentRemainingPct = Math.max(0, 100 - currentProgressPct);

  const visibleCards = useMemo(
    () => cards.filter((card) => !card.triage_label).slice(0, 3),
    [cards]
  );

  const selected = useMemo(
    () => cards.find((card) => card.post_key === selectedKey) || null,
    [cards, selectedKey]
  );

  const dragDx = drag ? drag.currentX - drag.startX : 0;

  function changeWindow(next: WindowKey) {
    setWindowKey(next);
    setSelectedKey(null);
    setDrag(null);
    setSaveError("");
    setSaveNotice("");
  }

  function addTen() {
    const step = window.extend_step ?? 10;
    const nextKeys = nextUnreviewedKeys(
      windowCards,
      baseReviewLimit,
      extraReviewKeys[windowKey],
      step
    );
    if (!nextKeys.length) return;

    setExtraReviewKeys((current) => ({
      ...current,
      [windowKey]: [...current[windowKey], ...nextKeys]
    }));
    setSelectedKey(null);
  }

  async function classify(card: SignalPostCard, label: TriageLabel) {
    if (savingKey) return;
    setSavingKey(card.post_key);
    setSaveError("");
    setSaveNotice("正在保存…");

    try {
      const response = await fetch("/api/signal-deck/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_key: card.post_key,
          post_id: card.post_id || null,
          permalink: card.permalink || null,
          snapshot_id: card.snapshot_id,
          window: windowKey,
          label,
          category: card.category,
          username: card.username || null,
          posted_at: card.posted_at || null,
          query: card.query || card.source_queries?.join(" / ") || null,
          text_excerpt: card.text.slice(0, 1200),
          feature_tags: card.feature_tags || [],
          base_score: card.base_score ?? card.score,
          deck_generated_at: deck.generated_at
        })
      });

      if (!response.ok) {
        throw new Error("分類沒有成功保存");
      }

      setLabels((current) => ({ ...current, [card.post_key]: label }));
      setSelectedKey(null);
      setSaveNotice(label === "relevant" ? "已存为 Relevant" : "已存为 Irrelevant");
      window.setTimeout(() => setSaveNotice(""), 2200);
    } catch (error) {
      setSaveNotice("");
      setSaveError(error instanceof Error ? error.message : "分類沒有成功保存");
    } finally {
      setSavingKey(null);
    }
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>, card: SignalPostCard) {
    if (savingKey) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      postKey: card.post_key,
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

  function finishDrag(card: SignalPostCard, dx: number, allowOpen: boolean) {
    setDrag(null);

    if (dx >= SWIPE_THRESHOLD) {
      void classify(card, "relevant");
      return;
    }
    if (dx <= -SWIPE_THRESHOLD) {
      void classify(card, "irrelevant");
      return;
    }

    if (allowOpen && Math.abs(dx) < 12) {
      setSelectedKey(selectedKey === card.post_key ? null : card.post_key);
    }
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>, card: SignalPostCard) {
    if (!drag || drag.pointerId !== event.pointerId) {
      setSelectedKey(selectedKey === card.post_key ? null : card.post_key);
      return;
    }
    finishDrag(card, event.clientX - drag.startX, true);
  }

  function pointerCancel(card: SignalPostCard) {
    if (!drag || drag.postKey !== card.post_key) {
      setDrag(null);
      return;
    }
    finishDrag(card, drag.currentX - drag.startX, false);
  }

  return (
    <section className="signalDeckPanel">
      <div className="signalDeckHead">
        <div>
          <p className="kicker">SIGNAL DECK · POST SWIPE</p>
          <h2>近期貼文卡</h2>
          <p className="muted">
            一次只處理最上面一張。點開確認完整內容；右拖 Relevant、左拖 Irrelevant，下一張會自動補上。
          </p>
        </div>
        <div className="windowTabs" aria-label="Signal Deck 時間範圍">
          {(["1d", "3d", "5d"] as WindowKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={windowKey === key ? "active" : ""}
              onClick={() => changeWindow(key)}
            >
              {deck.windows[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="signalDeckSub">
        <span>今日 Review · {window.label} 視窗</span>
        <span>Daily snapshot · {fmtDate(deck.generated_at)}</span>
      </div>

      <div className="reviewProgress" aria-label="今日 Review 進度">
        <div className="reviewProgressHead">
          <div>
            <span>今日進度</span>
            <strong>約 {currentProgressPct.toFixed(0)}%</strong>
          </div>
          <div className="reviewProgressLegend">
            <span className="unreviewed">尚餘約 {currentRemainingPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="reviewHpTrack" title={"今日進度約 " + currentProgressPct.toFixed(0) + "%"}>
          <span className="reviewHpRelevant" style={{ width: currentProgressPct + "%" }} />
        </div>
        <div className="reviewProgressFoot">
          <span>只表示目前每日批次的推估進度</span>
          <a href="/reviews">查看 Review Ledger ↗</a>
        </div>
      </div>

      {(saveNotice || saveError) ? (
        <div
          className={saveError ? "reviewActionFeedback error" : "reviewActionFeedback success"}
          role="status"
          aria-live="polite"
        >
          {saveError || saveNotice}
        </div>
      ) : null}

      <div className={`signalRailWrap swipeWorkspace ${drag ? "isDragging" : ""}`}>
        {drag ? (
          <>
            <div className={`swipeZone swipeZoneLeft ${dragDx < -SWIPE_THRESHOLD ? "active" : ""}`}>
              <strong>Irrelevant</strong>
              <span>往左放</span>
            </div>
            <div className={`swipeZone swipeZoneRight ${dragDx > SWIPE_THRESHOLD ? "active" : ""}`}>
              <strong>Relevant</strong>
              <span>往右放</span>
            </div>
          </>
        ) : null}

        {visibleCards.length ? (
          <div className="signalRail signalStack">
            {visibleCards.map((card, index) => (
              <PostCard
                key={card.post_key}
                card={card}
                index={index}
                selected={selectedKey === card.post_key}
                drag={drag}
                stacked={true}
                interactive={index === 0}
                onPointerDown={index === 0 ? pointerDown : () => {}}
                onPointerMove={index === 0 ? pointerMove : () => {}}
                onPointerUp={index === 0 ? pointerUp : () => {}}
                onPointerCancel={() => pointerCancel(card)}
                onOpen={() => {
                  if (index === 0) {
                    setSelectedKey(selectedKey === card.post_key ? null : card.post_key);
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="signalDeckEmpty">
            <strong>今天這一批已經整理完了。</strong>
            {remainingUnreviewed > 0 ? (
              <button type="button" className="addTenButton" onClick={addTen}>
                有余力，再加 {Math.min(window.extend_step ?? 10, remainingUnreviewed)} 篇
              </button>
            ) : (
              <span>目前這個時間窗已全部整理完成。</span>
            )}
          </div>
        )}
      </div>

      {selected ? (
        <div className="postPreview">
          <div className="postPreviewMeta">
            <div>
              <p className="kicker">POST PREVIEW</p>
              <h3>{selected.category}</h3>
              <p>@{selected.username || "unknown"} · {fmtDate(selected.posted_at)}</p>
            </div>
            {selected.permalink ? (
              <a href={selected.permalink} target="_blank" rel="noreferrer">
                Threads 原文 ↗
              </a>
            ) : null}
          </div>

          <p className="postPreviewText">{selected.text}</p>

          <div className="featureTags">
            {(selected.feature_tags || []).map((tag) => <span key={tag}>{tag}</span>)}
          </div>

          {selected.query || selected.source_queries?.length ? (
            <p className="postProvenance">
              query · {selected.query || selected.source_queries?.join(" / ")}
            </p>
          ) : null}

          <div className="triageActions">
              <button
                type="button"
                className="irrelevant"
                disabled={savingKey === selected.post_key}
                onClick={() => void classify(selected, "irrelevant")}
              >
                ← Irrelevant
              </button>
              <button
                type="button"
                className="relevant"
                disabled={savingKey === selected.post_key}
                onClick={() => void classify(selected, "relevant")}
              >
                Relevant →
              </button>
          </div>

          {saveError ? <p className="triageError">{saveError}</p> : null}
        </div>
      ) : (
        <div className="evidenceHint">
          點卡片看完整內容。桌面與觸控都可直接拖卡：左 = Irrelevant，右 = Relevant；按鈕只作為備用操作。
        </div>
      )}

    </section>
  );
}
