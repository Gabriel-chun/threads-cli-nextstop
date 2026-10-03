import { ReviewLedger } from "../../components/ReviewLedger";
import { T } from "../../components/I18nProvider";
import { loadDeidentifiedReviewRows } from "../../lib/reviewLedger";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const rows=await loadDeidentifiedReviewRows();
  const relevant=rows.filter(row=>row.label==="relevant").length;
  const irrelevant=rows.filter(row=>row.label==="irrelevant").length;

  return <main className="reviewsWorkspace">
    <header className="workspaceHeader">
      <div>
        <p className="eyebrow">NEXT STOP LIVE · REVIEW LEDGER</p>
        <h1><T k="reviews.title" /></h1>
        <p className="lead"><T k="reviews.lead" /></p>
      </div>
    </header>

    <div className="workspaceRule" />

    <section className="metrics reviewMetrics">
      <article><span><T k="reviews.metric.reviewed" /></span><strong>{rows.length}</strong><small>Notion review state</small></article>
      <article><span><T k="reviews.metric.relevant" /></span><strong>{relevant}</strong><small>human selected</small></article>
      <article><span><T k="reviews.metric.irrelevant" /></span><strong>{irrelevant}</strong><small>human excluded</small></article>
      <article className="accent"><span><T k="reviews.metric.archive" /></span><strong>00:00</strong><small><T k="reviews.metric.archiveHelp" /></small></article>
    </section>

    <section className="panel reviewLedgerPanel">
      <div className="panelHead reviewLedgerHead">
        <div>
          <p className="kicker"><T k="reviews.kicker" /></p>
          <h2><T k="reviews.ledgerTitle" /></h2>
          <p className="muted"><T k="reviews.ledgerHelp" /></p>
        </div>
        <div className="reviewLedgerActions">
          <div className="reviewArchiveStatus" aria-label="Review archive sync status"><strong><T k="reviews.liveSave" /></strong><small><T k="reviews.archiveAtMidnight" /></small></div>
          <a className="downloadButton reviewDownloadButton" href="/api/download/reviews/latest"><span>🗂️</span><div><strong><T k="reviews.download" /></strong><small><T k="reviews.downloadHelp" /></small></div></a>
        </div>
      </div>
      <ReviewLedger rows={rows} />
    </section>

    <footer><span>Next Stop Live · Human Review Ledger</span><span>De-identified · evidence provenance preserved</span></footer>
  </main>;
}
