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
import { useI18n } from "./I18nProvider";

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
  const {t,formatDate,dataLabel}=useI18n();
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
      aria-label={`${dataLabel(card.category)}，${card.summary}`}
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
        <span className={`reelKind ${card.kind}`}>{dataLabel(card.category)}</span>
        <span className="reelStatus">
          <i />
          {card.triage_label === "relevant"
            ? t("deck.relevant")
            : card.triage_label === "irrelevant"
              ? t("deck.irrelevant")
              : card.triage_label === "unsure"
                ? t("deck.unsure")
                : card.status}
        </span>
      </div>

      <p className="postCardText">{card.summary}</p>

      <div className="postCardMeta">
        <span>@{card.username || t("deck.unknownAuthor")}</span>
        <span>{formatDate(card.posted_at)}</span>
      </div>

      <div className="reelPeek">
        <small>
          {reviewView === "queue" ? t("deck.hintQueue") : t("deck.hintReview")}
        </small>
      </div>
    </div>
  );
}

export function SignalReel({ deck }: { deck: SignalDeck }) {
  const {t,formatDate,dataLabel}=useI18n();
  const [deckState, setDeckState] = useState(deck);
  const [windowKey, setWindowKey] = useState<WindowKey>("3d");
  const [loadingWindow, setLoadingWindow] = useState<WindowKey | null>(null);
  const [reviewView, setReviewView] = useState<ReviewView>("queue");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [labels, setLabels] = useState<Record<string, TriageLabel | null>>(
    Object.fromEntries(
      Object.values(deckState.windows)
        .flatMap((window) => window.cards)
        .map((card) => [card.post_key, card.triage_label || null])
    )
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [localReviews, setLocalReviews] = useState<Record<string, LocalReviewEntry>>({});
  const [syncingNotion, setSyncingNotion] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [demoKeys, setDemoKeys] = useState<string[]>([]);
  const [demoLabels, setDemoLabels] = useState<Record<string, TriageLabel | null>>({});
  const baseReviewLimits: Record<WindowKey, number> = {
    "1d": deckState.windows["1d"].default_review_limit ?? Math.min(40, deckState.windows["1d"].card_count),
    "3d": deckState.windows["3d"].default_review_limit ?? Math.min(40, deckState.windows["3d"].card_count),
    "5d": deckState.windows["5d"].default_review_limit ?? Math.min(40, deckState.windows["5d"].card_count)
  };
  const [extraReviewKeys, setExtraReviewKeys] = useState<Record<WindowKey, string[]>>({
    "1d": [], "3d": [], "5d": []
  });

  useEffect(() => {
    const controller = new AbortController();
    const keys = [
      ...new Set(
        deckState.windows[windowKey].cards
          .map((card) => card.post_key)
          .filter(Boolean)
      )
    ].slice(0, 200);

    if (!keys.length) return () => controller.abort();

    const params = new URLSearchParams();
    for (const key of keys) params.append("post_key", key);

    void fetch("/api/signal-deck/feedback?" + params.toString(), {
      signal: controller.signal,
      cache: "no-store"
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!payload?.feedback) return;
        setLabels((current) => ({
          ...current,
          ...Object.fromEntries(
            Object.entries(payload.feedback).map(([key, value]: [string, any]) => [
              key,
              value?.label === "relevant" || value?.label === "irrelevant" || value?.label === "unsure" ? value.label : null
            ])
          )
        }));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [deckState, windowKey]);

  useEffect(() => {
    try {
      const raw = globalThis.localStorage.getItem(LOCAL_REVIEW_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, LocalReviewEntry>;
      setLocalReviews(parsed);
      setLabels((current) => ({...current,...Object.fromEntries(Object.values(parsed).map((e)=>[e.row.post_key,e.row.label]))}));
    } catch {}
  }, []);

  const pendingReviews = useMemo(() => Object.values(localReviews).filter((e) => !e.synced), [localReviews]);
  function saveLocalReviews(next: Record<string, LocalReviewEntry>) {
    setLocalReviews(next);
    globalThis.localStorage.setItem(LOCAL_REVIEW_KEY, JSON.stringify(next));
  }

  const window = deckState.windows[windowKey];
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
      unsure: windowCards.filter((card) => card.triage_label === "unsure").length,
      unreviewed: windowCards.filter((card) => !card.triage_label).length
    }),
    [windowCards]
  );

  const reviewedPct = allCounts.total
    ? ((allCounts.relevant + allCounts.irrelevant + allCounts.unsure) / allCounts.total) * 100
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

  const demoCards = useMemo<SignalPostCard[]>(
    () =>
      demoKeys.flatMap((key) => {
        const card = windowCards.find((item) => item.post_key === key);
        if (!card) return [];
        return [{
          ...card,
          triage_label: demoLabels[card.post_key] ?? null
        }];
      }),
    [demoKeys, demoLabels, windowCards]
  );

  const activeCards = demoMode ? demoCards : cards;

  const counts = useMemo(
    () => ({
      queue: activeCards.filter((card) => !card.triage_label).length,
      relevant: activeCards.filter((card) => card.triage_label === "relevant").length,
      irrelevant: activeCards.filter((card) => card.triage_label === "irrelevant").length
    }),
    [activeCards]
  );

  const visibleCards = useMemo(() => {
    const filtered = activeCards.filter((card) => {
      if (reviewView === "queue") return !card.triage_label;
      return card.triage_label === reviewView;
    });
    return reviewView === "queue" ? filtered.slice(0, 3) : filtered.slice(0, 5);
  }, [activeCards, reviewView]);

  const selected = useMemo(
    () => activeCards.find((card) => card.post_key === selectedKey) || null,
    [activeCards, selectedKey]
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

  async function changeWindow(next: WindowKey) {
    if (next === windowKey || loadingWindow) return;

    const current = deckState.windows[next];
    if (!current.cards.length && current.card_count > 0) {
      setLoadingWindow(next);
      setSaveError("");
      try {
        const response = await fetch("/api/signal-deck/window/" + next, { cache: "force-cache" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.window) {
          throw new Error(payload?.error || t("common.error"));
        }
        setDeckState((state) => ({
          ...state,
          windows: { ...state.windows, [next]: payload.window }
        }));
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : t("common.error"));
        setLoadingWindow(null);
        return;
      }
      setLoadingWindow(null);
    }

    setWindowKey(next);
    setReviewView("queue");
    setSelectedKey(null);
    setDrag(null);
    setSaveError("");
    setSaveNotice("");
    setDemoMode(false);
    setDemoKeys([]);
    setDemoLabels({});
  }

  function startDemo() {
    const keys = windowCards.slice(0, 5).map((card) => card.post_key);
    if (!keys.length) return;
    setDemoKeys(keys);
    setDemoLabels(Object.fromEntries(keys.map((key) => [key, null])));
    setDemoMode(true);
    setReviewView("queue");
    setSelectedKey(null);
    setDrag(null);
    setSaveError("");
    setSaveNotice("");
  }

  function resetDemo() {
    if (!demoKeys.length) {
      startDemo();
      return;
    }
    setDemoLabels(Object.fromEntries(demoKeys.map((key) => [key, null])));
    setReviewView("queue");
    setSelectedKey(null);
    setDrag(null);
    setSaveNotice("");
  }

  function stopDemo() {
    setDemoMode(false);
    setDemoKeys([]);
    setDemoLabels({});
    setReviewView("queue");
    setSelectedKey(null);
    setDrag(null);
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
    if (demoMode) {
      setDemoLabels((current) => ({ ...current, [card.post_key]: label }));
      setSelectedKey(null);
      setSaveError("");
      setSaveNotice(label === "relevant" ? t("deck.demoRelevant") : label === "unsure" ? t("deck.unsure") : t("deck.demoIrrelevant"));
      globalThis.setTimeout(() => setSaveNotice(""), 1200);
      return;
    }

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
      deck_generated_at:deckState.generated_at,reviewed_at:prev?.reviewed_at||now
    };
    setLabels((current)=>({...current,[card.post_key]:label})); setSelectedKey(null); setSaveError("");
    const next={...localReviews,[card.post_key]:{row,synced:false,updated_at:now}}; saveLocalReviews(next);
    setSaveNotice(label==="relevant"?t("deck.savedRelevant"):label==="unsure"?t("deck.savedUnsure"):t("deck.savedIrrelevant"));
    globalThis.setTimeout(()=>setSaveNotice(""),1800);
  }

  async function syncPendingToNotion() {
    if (syncingNotion || !pendingReviews.length) return;

    const batchSize = 10;
    const queue = pendingReviews.map((entry) => entry.row);
    let workingReviews = { ...localReviews };
    let totalSynced = 0;

    setSyncingNotion(true);
    setSaveError("");
    setSaveNotice(t("deck.syncProgress",{done:0,total:queue.length}));

    try {
      for (let offset = 0; offset < queue.length; offset += batchSize) {
        const batch = queue.slice(offset, offset + batchSize);
        const response = await fetch("/api/signal-deck/sync-notion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-NextStop-Write-Intent": "human-review"
          },
          body: JSON.stringify({ rows: batch })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || t("deck.syncFailed")+" (HTTP "+response.status+")");
        }

        const synced = new Set<string>(payload?.synced_keys || []);
        const now = new Date().toISOString();
        workingReviews = Object.fromEntries(
          Object.entries(workingReviews).map(([key, entry]) => [
            key,
            synced.has(key) ? { ...entry, synced: true, updated_at: now } : entry
          ])
        );
        saveLocalReviews(workingReviews);
        totalSynced += synced.size;

        setSaveNotice(t("deck.syncProgress",{done:Math.min(offset+batch.length,queue.length),total:queue.length}));
      }

      setSaveNotice(t("deck.syncDone",{count:totalSynced}));
      globalThis.setTimeout(() => setSaveNotice(""), 2200);
    } catch (error) {
      setSaveNotice("");
      setSaveError(error instanceof Error ? error.message : t("deck.syncFailed"));
    } finally {
      setSyncingNotion(false);
    }
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
          <p className="kicker">{t("deck.kicker")}</p>
          <h2>{t("deck.title")}</h2>
          <p className="muted">
            {t("deck.lead")}
          </p>
        </div>
        <div className="windowTabs" aria-label={t("deck.rangeLabel")}>
          {(["1d", "3d", "5d"] as WindowKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={windowKey === key ? "active" : ""}
              disabled={Boolean(loadingWindow)}
              onClick={() => void changeWindow(key)}
            >
              {loadingWindow === key ? t("common.loading") : t("deck.window."+key)}
            </button>
          ))}
        </div>
      </div>

      <div className="signalDeckSub">
        <span>{t("deck.reviewToday",{window:t("deck.window."+windowKey)})}</span>
        <span>{t("deck.dailySnapshot",{date:formatDate(deckState.generated_at)})}</span>
      </div>

      <div className="reviewProgress" aria-label={t("deck.progress")}>
        <div className="reviewProgressHead">
          <div>
            <span>{t("deck.progress")}</span>
            <strong>{t("deck.progressApprox",{pct:reviewedPct.toFixed(0)})}</strong>
          </div>
          <div className="reviewProgressLegend">
            <span className="unreviewed">{t("deck.remainingApprox",{pct:(100-reviewedPct).toFixed(0)})}</span>
          </div>
        </div>
        <div className="reviewHpTrack" title={t("deck.progressApprox",{pct:reviewedPct.toFixed(0)})}>
          <span className="reviewHpRelevant" style={{ width: reviewedPct + "%" }} />
        </div>
        <div className="reviewProgressFoot">
          <span>{t("deck.progressHelp")}</span>
          <div className="reviewProgressActions">
            <button type="button" className="syncNotionButton" disabled={syncingNotion || pendingReviews.length===0} onClick={()=>void syncPendingToNotion()}>
              {syncingNotion ? t("deck.syncing") : pendingReviews.length ? t("deck.syncPending",{count:pendingReviews.length}) : t("deck.synced")}
            </button>
            {allCounts.unreviewed === 0 ? (
              demoMode ? (
                <button type="button" className="demoModeButton active" onClick={stopDemo}>
                  {t("deck.demoStop")}
                </button>
              ) : (
                <button type="button" className="demoModeButton" onClick={startDemo}>
                  {t("deck.demoStart")}
                </button>
              )
            ) : null}
            <a href="/reviews">{t("deck.openLedger")}</a>
          </div>
        </div>
      </div>

      {(saveNotice || saveError) ? (
        <div className={saveError ? "triageError" : "reviewSaveMessage"} role="status" aria-live="polite">
          {saveError || saveNotice}
        </div>
      ) : null}

      {demoMode ? (
        <div className="demoModeNotice" role="status">
          <strong>{t("deck.demoMode")}</strong>
          <span>{t("deck.demoHelp")}</span>
        </div>
      ) : null}

      <div className={`signalRailWrap swipeWorkspace ${drag ? "isDragging" : ""}`}>
        {drag ? (
          <>
            <div className={`swipeZone swipeZoneLeft ${dragDx < -SWIPE_THRESHOLD ? "active" : ""}`}>
              <strong>{t("deck.irrelevant")}</strong>
              <span>{t("deck.dropLeft")}</span>
            </div>
            <div className={`swipeZone swipeZoneRight ${dragDx > SWIPE_THRESHOLD ? "active" : ""}`}>
              <strong>{t("deck.relevant")}</strong>
              <span>{t("deck.dropRight")}</span>
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
              demoMode ? (
                <>
                  <strong>{t("deck.demoDone")}</strong>
                  <div className="demoDoneActions">
                    <button type="button" className="addTenButton" onClick={resetDemo}>
                      {t("deck.demoAgain")}
                    </button>
                    <button type="button" className="demoModeButton" onClick={stopDemo}>
                      {t("deck.demoStop")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <strong>{t("deck.done")}</strong>
                  {remainingUnreviewed > 0 ? (
                    <button type="button" className="addTenButton" onClick={addTen}>
                      {t("deck.addMore",{count:Math.min(window.extend_step ?? 10,remainingUnreviewed)})}
                    </button>
                  ) : (
                    <>
                      <span>{t("deck.windowDone")}</span>
                      <button type="button" className="demoModeButton" onClick={startDemo}>
                        {t("deck.demoStart")}
                      </button>
                    </>
                  )}
                </>
              )
            ) : (
              t("deck.noneReview",{label:reviewView === "relevant" ? t("deck.relevant") : t("deck.irrelevant")})
            )}
          </div>
        )}
      </div>

      <div className="reviewLedger">
        <span>{t("deck.reviewLog")}</span>
        {reviewView !== "queue" ? (
          <button type="button" onClick={() => { setReviewView("queue"); setSelectedKey(null); }}>
            {t("deck.backQueue")}
          </button>
        ) : null}
        <button
          type="button"
          className={reviewView === "relevant" ? "active relevant" : ""}
          onClick={() => { setReviewView("relevant"); setSelectedKey(null); }}
        >
          {t("deck.relevant")}
        </button>
        <button
          type="button"
          className={reviewView === "irrelevant" ? "active irrelevant" : ""}
          onClick={() => { setReviewView("irrelevant"); setSelectedKey(null); }}
        >
          {t("deck.irrelevant")}
        </button>
      </div>

      {selected ? (
        <div className="postPreview">
          <div className="postPreviewMeta">
            <div>
              <p className="kicker">{t("deck.postPreview")}</p>
              <h3>{dataLabel(selected.category)}</h3>
              <p>@{selected.username || t("deck.unknownAuthor")} · {formatDate(selected.posted_at)}</p>
            </div>
            {selected.permalink ? (
              <a href={selected.permalink} target="_blank" rel="noreferrer">
                {t("deck.threadsOriginal")}
              </a>
            ) : null}
          </div>

          <p className="postPreviewText">{selected.text}</p>

          <div className="featureTags">
            {selected.candidate_confidence ? (
              <span>confidence · {t("trend.confidence."+selected.candidate_confidence)}</span>
            ) : null}
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
                ← {t("deck.irrelevant")}
              </button>
              <button
                type="button"
                className="unsure"
                disabled={false}
                onClick={() => void classify(selected, "unsure")}
              >
                {t("deck.unsure")}
              </button>
              <button
                type="button"
                className="relevant"
                disabled={false}
                onClick={() => void classify(selected, "relevant")}
              >
                {t("deck.relevant")} →
              </button>
            </div>
          ) : null}

          {saveError ? <p className="triageError">{saveError}</p> : null}
        </div>
      ) : (
        <div className="evidenceHint">
          {t("deck.fullHint")}
        </div>
      )}

      {relevantClusters.length ? (
        <div className="relevantSummary">
          <span>{t("deck.relevantSummary")}</span>
          {relevantClusters.map((cluster) => (
            <div key={cluster.category}>
              <strong>{dataLabel(cluster.category)}</strong>
              <em>{cluster.count}</em>
              {cluster.features.length ? <small>{cluster.features.join(" · ")}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
