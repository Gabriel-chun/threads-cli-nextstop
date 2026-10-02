"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  SignalDeck,
  SignalPostCard,
  TriageLabel
} from "../lib/signalDeck";
import type { SignalDeckFeedback } from "../lib/signalDeckFeedback";
import {
  buildReviewBatch,
  nextUnreviewedKeys,
  remainingUnreviewedCount
} from "../lib/reviewQuota";

type WindowKey = "1d" | "3d" | "5d";
type ReviewView = "queue" | "relevant" | "irrelevant";

type DragState = {
  postKey: string;
  pointerId: number;
  startX: number;
  currentX: number;
};

const SWIPE_THRESHOLD = 86;
const LOCAL_REVIEW_KEY = "next-stop-live:signal-review-session:v1";
type LocalReviewEntry = { row: SignalDeckFeedback; synced: boolean; updated_at: string };

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
  reviewView,
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
  reviewView: ReviewView;
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
        <small>
          {reviewView === "queue"
            ? "點一下看完整內容 · 左拖 Irrelevant · 右拖 Relevant"
            : "點一下回看完整內容"}
        </small>
      </div>
    </div>
  );
}

export function SignalReel({ deck }: { deck: SignalDeck }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("3d");
  const [reviewView, setReviewView] = useState<ReviewView>("queue");
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
  const [localReviews, setLocalReviews] = useState<Record<string, LocalReviewEntry>>({});
  const [syncingNotion, setSyncingNotion] = useState(false);
  const baseReviewLimits: Record<WindowKey, number> = {
    "1d": deck.windows["1d"].default_review_limit ?? Math.min(40, deck.windows["1d"].card_count),
    "3d": deck.windows["3d"].default_review_limit ?? Math.min(40, deck.windows["3d"].card_count),
    "5d": deck.windows["5d"].default_review_limit ?? Math.min(40, deck.windows["5d"].card_count)
  };
  const [extraReviewKeys, setExtraReviewKeys] = useState<Record<WindowKey, string[]>>({
    "1d": [], "3d": [], "5d": []
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_REVIEW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, LocalReviewEntry>;
      setLocalReviews(parsed);
      setLabels((current) => ({...current,...Object.fromEntries(Object.values(parsed).map((e)=>[e.row.post_key,e.row.label]))}));
    } catch {}
  }, []);

  const pendingReviews = useMemo(() => Object.values(localReviews).filter((e) => !e.synced), [localReviews]);
  function saveLocalReviews(next: Record<string, LocalReviewEntry>) {
    setLocalReviews(next);
    window.localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify(next));
  }

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

  const allCounts = useMemo(
    () => ({
      total: windowCards.length,
      relevant: windowCards.filter((card) => card.triage_label === "relevant").length,
      irrelevant: windowCards.filter((card) => card.triage_label === "irrelevant").length,
      unreviewed: windowCards.filter((card) => !card.triage_label).length
    }),
    [windowCards]
  );

  const reviewedPct = allCounts.total
    ? ((allCounts.relevant + allCounts.irrelevant) / allCounts.total) * 100
    : 0;
  const relevantPct = allCounts.total ? (allCounts.relevant / allCounts.total) * 100 : 0;
  const irrelevantPct = allCounts.total ? (allCounts.irrelevant / allCounts.total) * 100 : 0;

  const cards = useMemo(
    () => buildReviewBatch(windowCards, baseReviewLimit, extraReviewKeys[windowKey]),
    [windowCards, baseReviewLimit, extraReviewKeys, windowKey]
  );

  const remainingUnreviewed = useMemo(
    () => remainingUnreviewedCount(windowCards, baseReviewLimit, extraReviewKeys[windowKey]),
    [windowCards, baseReviewLimit, extraReviewKeys, windowKey]
  );
  const reviewLimit = cards.length;

  const counts = useMemo(
    () => ({
      queue: cards.filter((card) => !card.triage_label).length,
      relevant: cards.filter((card) => card.triage_label === "relevant").length,
      irrelevant: cards.filter((card) => card.triage_label === "irrelevant").length
    }),
    [cards]
  );

  const visibleCards = useMemo(() => {
    const filtered = cards.filter((card) => {
      if (reviewView === "queue") return !card.triage_label;
      return card.triage_label === reviewView;
    });
    return reviewView === "queue" ? filtered.slice(0, 3) : filtered.slice(0, 5);
  }, [cards, reviewView]);

  const selected = useMemo(
    () => cards.find((card) => card.post_key === selectedKey) || null,
    [cards, selectedKey]
  );

  const relevantClusters = useMemo(() => {
    const grouped = new Map<string, { category: string; count: number; features: Map<string, number> }>();
    for (const card of windowCards.filter((item) => item.triage_label === "relevant")) {
      const current = grouped.get(card.category) || {
        category: card.category,
        count: 0,
        features: new Map<string, number>()
      };
      current.count += 1;
      for (const tag of card.feature_tags || []) {
        current.features.set(tag, (current.features.get(tag) || 0) + 1);
      }
      grouped.set(card.category, current);
    }
    return [...grouped.values()]
      .map((cluster) => ({
        category: cluster.category,
        count: cluster.count,
        features: [...cluster.features.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([tag]) => tag)
      }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  }, [windowCards]);

  const dragDx = drag ? drag.currentX - drag.startX : 0;

  function changeWindow(next: WindowKey) {
    setWindowKey(next);
    setReviewView("queue");
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
    setReviewView("queue");
    setSelectedKey(null);
  }

  function classify(card: SignalPostCard, label: TriageLabel) {
    const now=new Date().toISOString();
    const prev=localReviews[card.post_key]?.row;
    const row:SignalDeckFeedback={
      id:prev?.id||"local_"+card.post_key,post_key:card.post_key,post_id:card.post_id||null,permalink:card.permalink||null,
      snapshot_id:card.snapshot_id,window:windowKey,label,original_label:prev?.original_label||prev?.label||label,
      label_updated_at:prev&&prev.label!==label?now:(prev?.label_updated_at||null),
      category:card.category,original_category:prev?.original_category||prev?.category||card.category,
      category_source:prev?.category_source||"system",category_updated_at:prev?.category_updated_at||null,
      username:card.username||null,posted_at:card.posted_at||null,query:card.query||card.source_queries?.join(" / ")||null,
      text_excerpt:card.text.slice(0,1200),feature_tags:card.feature_tags||[],base_score:card.base_score??card.score,
      deck_generated_at:deck.generated_at,reviewed_at:prev?.reviewed_at||now
    };
    setLabels((current)=>({...current,[card.post_key]:label})); setSelectedKey(null); setSaveError("");
    const next={...localReviews,[card.post_key]:{row,synced:false,updated_at:now}}; saveLocalReviews(next);
    setSaveNotice(label==="relevant"?"已放入 Relevant · 待同步":"已放入 Irrelevant · 待同步");
    globalThis.setTimeout(()=>setSaveNotice(""),1800);
  }

  async function syncPendingToNotion() {
    if(syncingNotion||!pendingReviews.length)return;
    setSyncingNotion(true);setSaveError("");setSaveNotice(`正在同步 ${pendingReviews.length} 筆到 Notion…`);
    try{
      const response=await fetch("/api/signal-deck/sync-notion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:pendingReviews.map((e)=>e.row)})});
      const payload=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(payload?.error||`Notion 同步失敗（HTTP ${response.status}）`);
      const synced=new Set<string>(payload?.synced_keys||[]);
      saveLocalReviews(Object.fromEntries(Object.entries(localReviews).map(([k,e])=>[k,synced.has(k)?{...e,synced:true,updated_at:new Date().toISOString()}:e])));
      setSaveNotice(`已同步 ${synced.size} 筆到 Notion`);globalThis.setTimeout(()=>setSaveNotice(""),2200);
    }catch(error){setSaveNotice("");setSaveError(error instanceof Error?error.message:"Notion 同步失敗");}
    finally{setSyncingNotion(false);}
  }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>, card: SignalPostCard) {
    if (reviewView !== "queue" || savingKey) return;
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

    if (reviewView === "queue" && dx >= SWIPE_THRESHOLD) {
      void classify(card, "relevant");
      return;
    }
    if (reviewView === "queue" && dx <= -SWIPE_THRESHOLD) {
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
            <strong>約 {reviewedPct.toFixed(0)}%</strong>
          </div>
          <div className="reviewProgressLegend">
            <span className="unreviewed">尚餘約 {(100 - reviewedPct).toFixed(0)}%</span>
          </div>
        </div>
        <div className="reviewHpTrack" title={"今日進度約 " + reviewedPct.toFixed(0) + "%"}>
          <span className="reviewHpRelevant" style={{ width: reviewedPct + "%" }} />
        </div>
        <div className="reviewProgressFoot">
          <span>只表示目前每日批次的推估進度</span>
          <div className="reviewProgressActions">
            <button type="button" className="syncNotionButton" disabled={syncingNotion || pendingReviews.length===0} onClick={()=>void syncPendingToNotion()}>
              {syncingNotion ? "同步中…" : pendingReviews.length ? `同步到 Notion · 待同步 ${pendingReviews.length}` : "Notion 已同步"}
            </button>
            <a href="/reviews">查看 Review Ledger ↗</a>
          </div>
        </div>
      </div>

      {(saveNotice || saveError) ? (
        <div className={saveError ? "triageError" : "reviewSaveMessage"} role="status" aria-live="polite">
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
          <div className={`signalRail ${reviewView === "queue" ? "signalStack" : ""}`}>
            {visibleCards.map((card, index) => (
              <PostCard
                key={card.post_key}
                card={card}
                index={index}
                selected={selectedKey === card.post_key}
                drag={drag}
                reviewView={reviewView}
                stacked={reviewView === "queue"}
                interactive={reviewView !== "queue" || index === 0}
                onPointerDown={index === 0 || reviewView !== "queue" ? pointerDown : () => {}}
                onPointerMove={index === 0 || reviewView !== "queue" ? pointerMove : () => {}}
                onPointerUp={index === 0 || reviewView !== "queue" ? pointerUp : () => {}}
                onPointerCancel={() => pointerCancel(card)}
                onOpen={() => {
                  if (reviewView !== "queue" || index === 0) {
                    setSelectedKey(selectedKey === card.post_key ? null : card.post_key);
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="signalDeckEmpty">
            {reviewView === "queue" ? (
              <>
                <strong>今天這一批已經整理完了。</strong>
                {remainingUnreviewed > 0 ? (
                  <button type="button" className="addTenButton" onClick={addTen}>
                    有余力，再加 {Math.min(window.extend_step ?? 10, remainingUnreviewed)} 篇
                  </button>
                ) : (
                  <span>目前這個時間窗已全部整理完成。</span>
                )}
              </>
            ) : (
              `目前沒有 ${reviewView === "relevant" ? "Relevant" : "Irrelevant"} 貼文。`
            )}
          </div>
        )}
      </div>

      <div className="reviewLedger">
        <span>分類紀錄</span>
        {reviewView !== "queue" ? (
          <button type="button" onClick={() => { setReviewView("queue"); setSelectedKey(null); }}>
            ← 回待分類
          </button>
        ) : null}
        <button
          type="button"
          className={reviewView === "relevant" ? "active relevant" : ""}
          onClick={() => { setReviewView("relevant"); setSelectedKey(null); }}
        >
          Relevant
        </button>
        <button
          type="button"
          className={reviewView === "irrelevant" ? "active irrelevant" : ""}
          onClick={() => { setReviewView("irrelevant"); setSelectedKey(null); }}
        >
          Irrelevant
        </button>
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

          {reviewView === "queue" ? (
            <div className="triageActions">
              <button
                type="button"
                className="irrelevant"
                disabled={false}
                onClick={() => void classify(selected, "irrelevant")}
              >
                ← Irrelevant
              </button>
              <button
                type="button"
                className="relevant"
                disabled={false}
                onClick={() => void classify(selected, "relevant")}
              >
                Relevant →
              </button>
            </div>
          ) : null}

          {saveError ? <p className="triageError">{saveError}</p> : null}
        </div>
      ) : (
        <div className="evidenceHint">
          點卡片看完整內容。桌面與觸控都可直接拖卡：左 = Irrelevant，右 = Relevant；按鈕只作為備用操作。
        </div>
      )}

      {relevantClusters.length ? (
        <div className="relevantSummary">
          <span>Relevant summary</span>
          {relevantClusters.map((cluster) => (
            <div key={cluster.category}>
              <strong>{cluster.category}</strong>
              <em>{cluster.count}</em>
              {cluster.features.length ? <small>{cluster.features.join(" · ")}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
