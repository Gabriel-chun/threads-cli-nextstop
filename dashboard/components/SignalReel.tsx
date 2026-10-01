"use client";

import { useMemo, useState } from "react";
import type { SignalDeck, SignalDeckCard } from "../lib/signalDeck";

type WindowKey = "1d" | "3d" | "5d";

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
      className={`reelCard reelCard${index % 5} ${selected ? "selected" : ""}`}
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
    >
      <div className="reelCardTop">
        <span className={`reelKind ${card.kind}`}>{card.category}</span>
        <span className="reelStatus"><i />{card.status}</span>
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
        <small>滑過看摘要 · 點一下看來源</small>
      </div>
    </button>
  );
}

export function SignalReel({ deck }: { deck: SignalDeck }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("3d");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const window = deck.windows[windowKey];

  const selected = useMemo(
    () => window.cards.find((card) => card.id === selectedId) || null,
    [window.cards, selectedId]
  );

  function changeWindow(next: WindowKey) {
    setWindowKey(next);
    setSelectedId(null);
  }

  return (
    <section className="signalDeckPanel">
      <div className="signalDeckHead">
        <div>
          <p className="kicker">SIGNAL REEL · DAILY</p>
          <h2>近期訊號</h2>
          <p className="muted">
            每日從 Master 聚合一次。卡片保持散開，滑過看主題，點擊後再展開來源證據。
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
        <span>{window.card_count} 個主題</span>
        <span>Daily snapshot · {fmtDate(deck.generated_at)}</span>
      </div>

      {window.cards.length ? (
        <div className="signalRailWrap">
          <div className="signalRail">
            {window.cards.map((card, index) => (
              <ReelCard
                key={card.id}
                card={card}
                index={index}
                selected={selectedId === card.id}
                onSelect={() => setSelectedId(selectedId === card.id ? null : card.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="signalDeckEmpty">
          這個時間窗暫時沒有足夠的可用訊號。Daily Deck 不會把 coverage gap 當成零需求。
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
        <div className="evidenceHint">把滑鼠移到卡片上快速掃描；點一下卡片，下面才展開來源清單。</div>
      )}
    </section>
  );
}
