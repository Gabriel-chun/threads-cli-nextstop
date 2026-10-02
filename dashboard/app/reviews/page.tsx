import { ReviewLedger } from "../../components/ReviewLedger";
import { loadDeidentifiedReviewRows } from "../../lib/reviewLedger";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const rows = await loadDeidentifiedReviewRows();
  const relevant = rows.filter((row) => row.label === "relevant").length;
  const irrelevant = rows.filter((row) => row.label === "irrelevant").length;

  return (
    <main className="reviewsWorkspace">
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">NEXT STOP LIVE · REVIEW LEDGER</p>
          <h1>Reviewed Signals</h1>
          <p className="lead">
            已完成 Relevant / Irrelevant 判斷的資料檢視。頁面使用即時 Blob review state，顯示內容經去識別化；原始 Threads 連結只保留作 evidence provenance。
          </p>
        </div>
        <a className="backButton" href="/">← Signal Desk</a>
      </header>

      <div className="workspaceRule" />

      <section className="metrics reviewMetrics">
        <article><span>Reviewed</span><strong>{rows.length}</strong><small>live review state</small></article>
        <article><span>Relevant</span><strong>{relevant}</strong><small>human selected</small></article>
        <article><span>Irrelevant</span><strong>{irrelevant}</strong><small>human excluded</small></article>
        <article className="accent">
          <span>Archive</span>
          <strong>00:00</strong>
          <small>Asia/Taipei daily close</small>
        </article>
      </section>

      <section className="panel reviewLedgerPanel">
        <div className="panelHead reviewLedgerHead">
          <div>
            <p className="kicker">DE-IDENTIFIED REVIEW DATA</p>
            <h2>Relevant / Irrelevant Ledger</h2>
            <p className="muted">
              這裡是即時已分類資料；下載檔則是最近一次已完成日結的 GitHub archive。
            </p>
          </div>
          <div className="reviewLedgerActions">
            <div className="reviewArchiveStatus" aria-label="Review archive sync status">
              <strong>即時保存</strong>
              <small>00:00 Asia/Taipei 自動歸檔 GitHub</small>
            </div>
            <a className="downloadButton reviewDownloadButton" href="/api/download/reviews/latest">
              <span>🗂️</span>
              <div>
                <strong>下載 Reviewed Cards JSON</strong>
                <small>去識別化 · 最近一次完成日結</small>
              </div>
            </a>
          </div>
        </div>

        <ReviewLedger rows={rows} />
      </section>

      <footer>
        <span>Next Stop Live · Human Review Ledger</span>
        <span>Display is de-identified; source links remain available for evidence checks.</span>
      </footer>
    </main>
  );
}
