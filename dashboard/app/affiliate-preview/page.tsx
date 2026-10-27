import type { Metadata } from "next";
import { AFFILIATE_CATALOG, INTENT_SCENARIOS, verifiedOffers } from "../../lib/affiliateBridge";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Next Stop Live | Intent → Product 預覽",
  description: "活動需求與聯盟商品匹配的設計預覽。尚未開放導購。",
  robots: { index: false, follow: false }
};

// Deliberately empty until actual redirect domains have been checked in
// the affiliate console and approved. Never infer hosts from screenshots.
const APPROVED_AFFILIATE_HOSTS: string[] = [];

export default function AffiliatePreviewPage() {
  const approvedCount = AFFILIATE_CATALOG.filter((item) => item.status === "verified").length;

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.micro}>NEXT STOP LIVE / COMMERCE EXPERIMENT 0.1</div>
        <div className={styles.heading}>
          <div>
            <h1>從下一站的問題，找到合適的解法。</h1>
            <p className={styles.lead}>
              先理解演唱會觀眾正在煩惱什麼，再比較能解決問題的交通、行程與住宿選擇。
              不是依照熱門關鍵字亂塞商品。
            </p>
          </div>
          <div className={styles.previewFlag}>設計預覽 · 非正式導購</div>
        </div>
        <div className={styles.hint}>
          這一版不含任何未確認的 KKday 聯盟連結，也不會自動從社群文章產生商品推薦。
          商品須由人工確認適用性與聯盟資格後才會開啟。
        </div>
      </header>

      <section className={styles.intro} aria-label="需求探索">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.micro}>DISCOVER BY INTENT</span>
            <h2>你現在最想解決哪件事？</h2>
          </div>
          <p>先選情境，再檢查當下是否有可用商品。</p>
        </div>
        <div className={styles.intentCards}>
          {INTENT_SCENARIOS.map((item) => (
            <a href={"#" + item.id} key={item.id} className={styles.intentCard}>
              <span className={styles.micro}>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <span>{item.question}</span>
              <span className={styles.intentArrow}>查看情境 ↓</span>
            </a>
          ))}
        </div>
      </section>

      <section className={styles.sections} aria-label="需求與商品候選">
        {INTENT_SCENARIOS.map((intent, index) => {
          const offers = verifiedOffers(AFFILIATE_CATALOG, intent.id, APPROVED_AFFILIATE_HOSTS);
          return (
            <article key={intent.id} id={intent.id} className={styles.scenario}>
              <div className={styles.scenarioHeading}>
                <div className={styles.bigNumber}>0{index + 1}</div>
                <div>
                  <span className={styles.micro}>INTENT / {intent.id.toUpperCase()}</span>
                  <h2>{intent.title}</h2>
                  <p>{intent.question}</p>
                </div>
              </div>
              <div className={styles.scenarioContent}>
                <div>
                  <h3>先確認什麼？</h3>
                  <p>{intent.solution}</p>
                  <p className={styles.disclosure}>
                    資訊僅供安排行程參考；交通班次、活動日期、價格與商品供應仍須以官方最新公告為準。
                  </p>
                </div>
                <div className={styles.offerPanel}>
                  <div className={styles.offerTitle}>
                    <h3>符合情境的商品</h3>
                    <span>{offers.length > 0 ? "已驗證" : "尚待驗證"}</span>
                  </div>
                  {offers.length > 0 ? (
                    <div className={styles.offerList}>
                      {offers.map((product) => (
                        <div className={styles.offer} key={product.id}>
                          <div>
                            <strong>{product.title}</strong>
                            <small>{product.merchant} · 最後人工驗證：{product.verifiedAt?.slice(0, 10)}</small>
                          </div>
                          <a href={product.affiliateUrl} target="_blank" rel="sponsored noopener noreferrer">
                            查看合作平台商品 ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <strong>目前沒有通過人工驗證的推薦商品</strong>
                      <p>在確認商品適用的地點、日期與官方聯盟追蹤連結之前，暫時不顯示購買入口。</p>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.method} aria-label="匹配原則">
        <div>
          <span className={styles.micro}>HOW RECOMMENDATIONS WORK</span>
          <h2>先檢查需求，再呈現商品。</h2>
          <p>
            目前的 Trend、Signal Deck 與人工 Relevant / Irrelevant 審查仍留在原系統。
            本頁只負責呈現能被說明與驗證的問題，以及真正通過確認的商品。
          </p>
        </div>
        <div className={styles.steps}>
          <div><b>01</b><span>辨認具體需求</span></div>
          <div><b>02</b><span>人工檢查商品適用性</span></div>
          <div><b>03</b><span>確認聯盟連結與來源</span></div>
          <div><b>04</b><span>追蹤點擊與平台回報的轉換</span></div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div><strong>Next Stop Live</strong><span>Intent → Product Preview</span></div>
        <p>
          部分未來商品入口可能含聯盟連結。若透過連結完成符合條件的購買，
          本站可能獲得佣金，通常不影響你在合作平台看到的價格。
        </p>
        <small>已確認候選：{approvedCount} · 本版尚未接入聯盟轉換報表。</small>
      </footer>
    </main>
  );
}
