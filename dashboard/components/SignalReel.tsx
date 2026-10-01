"use client";

import { useMemo, useState } from "react";
import type {
  SignalDeck,
  SignalDeckCard,
  TriageLabel
} from "../lib/signalDeck";

type WindowKey = "1d" | "3d" | "5d";
type DeckView = "queue" | "relevant" | "irrelevant";

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

function Activity({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="reelActivity" aria-label="近期活動量">
      {values.map((value, index) => (
        <i
          key={index}
          style={{ height: `${Math.max(16, (value / max) * 100)}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ReelCard({
  card,
  index,
  selected,
  onSelect
}: {
  card: SignalDeckCard;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`reelCard reelCard${index % 5} ${selected ? "selected" : ""} ${card.triage_label || ""}`}
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
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

      <div className="reelCardCore">
        <strong>{card.mentions}</strong>
        <span>signals</span>
        <Activity values={card.activity} />
      </div>

      <div className="reelCardMeta">
        <span>{card.authors} authors</span>
        <span>Last {fmtDate(card.last_seen)}</span>
      </div>

      <div className="reelPeek">
        <h3>{card.headline}</h3>
        <p>{card.summary}</p>
        <small>滑過看摘要 · 點一下分類與看來源</small>
      </div>
    </button>
  );
}

export function SignalReel({ deck }: { deck: SignalDeck }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("3d");
  const [view, setView] = useState<DeckView>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, TriageLabel | null>>(
    Object.fromEntries(
      Object.values(deck.windows)
        .flatMap((window) => window.cards)
        .map((card) => [card.snapshot_id, card.triage_label || null])
    )
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const window = deck.windows[windowKey];
  const cards = useMemo(
    () =>
      window.cards.map((card) => ({
        ...card,
        triage_label: labels[card.snapshot_id] ?? card.triage_label ?? null
      })),
    [window.cards, labels]
  );

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
      if (view === "queue") return !card.triage_label;
      return card.triage_label === view;
    });
    return filtered.slice(0, window.display_limit || 5);
  }, [cards, view, window.display_limit]);

  const selected = useMemo(
    () => cards.find((card) => card.snapshot_id === selectedId) || null,
    [cards, selectedId]
  );

  function changeWindow(next: WindowKey) {
    setWindowKey(next);
    setView("queue");
    setSelectedId(null);
    setSaveError("");
  }

  async function classify(card: SignalDeckCard, label: TriageLabel) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/signal-deck/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: card.snapshot_id,
          card_id: card.id,
          window: windowKey,
          label,
          category: card.category,
          headline: card.headline,
          summary: card.summary,
          feature_tags: card.feature_tags || [],
          base_score: card.base_score ?? card.score,
          deck_generated_at: deck.generated_at
        })
      });
      if (!response.ok) {
        throw new Error("分類沒有成功保存");
      }
      setLabels((current) => ({ ...current, [card.snapshot_id]: label }));
      setSelectedId(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "分類沒有成功保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="signalDeckPanel">
      <div className="signalDeckHead">
        <div>
          <p className="kicker">SIGNAL REEL · DAILY TRIAGE</p>
          <h2>近期訊號</h2>
          <p className="muted">
            每日從 Master 聚合一次。你只需要把卡片分成 Relevant / Irrelevant；每週一再用累積 feedback 更新下一週排序。
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
        <span>{window.signal_count} 個有效訊號</span>
        <span>{window.card_count} 個候選主題</span>
        <span>Daily snapshot · {fmtDate(deck.generated_at)}</span>
      </div>

      <div className="triageTabs" aria-label="人工分類狀態">
        {([
          ["queue", "待分類"],
          ["relevant", "Relevant"],
          ["irrelevant", "Irrelevant"]
        ] as const).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => {
              setView(key);
              setSelectedId(null);
            }}
          >
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {visibleCards.length ? (
        <div className="signalRailWrap">
          <div className="signalRail">
            {visibleCards.map((card, index) => (
              <ReelCard
                key={card.snapshot_id}
                card={card}
                index={index}
                selected={selectedId === card.snapshot_id}
                onSelect={() =>
                  setSelectedId(selectedId === card.snapshot_id ? null : card.snapshot_id)
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="signalDeckEmpty">
          {view === "queue"
            ? "這個時間窗目前沒有待分類卡片。已分類內容仍可在 Relevant / Irrelevant 查看。"
            : `目前沒有 ${view === "relevant" ? "Relevant" : "Irrelevant"} 卡片。`}
        </div>
      )}

      {selected ? (
        <div className="evidenceBoard">
          <div className="evidenceSummary">
            <p className="kicker">SOURCE EVIDENCE</p>
            <h3>{selected.headline}</h3>
            <p>{selected.summary}</p>
            <div className="evidenceStats">
              <span>{selected.mentions} mentions</span>
              <span>{selected.authors} authors</span>
              <span>{selected.source_breakdown.map((item) => `${item.source} ${item.count}`).join(" · ")}</span>
            </div>
            {selected.feature_tags?.length ? (
              <div className="featureTags">
                {selected.feature_tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
            <div className="triageActions">
              <button
                type="button"
                className="relevant"
                disabled={saving}
                onClick={() => classify(selected, "relevant")}
              >
                ✓ Relevant
              </button>
              <button
                type="button"
                className="irrelevant"
                disabled={saving}
                onClick={() => classify(selected, "irrelevant")}
              >
                → Irrelevant
              </button>
            </div>
            {saveError ? <p className="triageError">{saveError}</p> : null}
          </div>

          <div className="evidenceList">
            {selected.evidence.map((item, index) => (
              <a
                href={item.permalink || "#"}
                target="_blank"
                rel="noreferrer"
                className="evidenceItem"
                key={item.id || `${selected.id}-${index}`}
              >
                <div>
                  <strong>{item.source}</strong>
                  <span>@{item.username || "unknown"} · {fmtDate(item.posted_at)}</span>
                </div>
                <p>{item.text}</p>
                <em>原文 ↗</em>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div className="evidenceHint">
          滑過快速掃描；點一下看來源，再決定 Relevant / Irrelevant。分類只影響 Signal Deck，不會刪 Master。
        </div>
      )}
    </section>
  );
}
