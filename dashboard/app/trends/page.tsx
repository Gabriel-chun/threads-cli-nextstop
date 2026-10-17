import { TrendObservationView } from "../../components/TrendObservationView";
import { loadReviewIntelligence, loadTrendIndex, loadTrendRadar } from "../../lib/trendRadar";

export const dynamic="force-dynamic";

export default async function TrendsPage({
  searchParams
}:{
  searchParams:Promise<{snapshot?:string;date?:string;view?:string}>
}){
  const params=await searchParams;
  const initialView = params.view==="observation" || params.view==="connections" || params.view==="eventWatch" ? params.view : "reviewIntelligence";
  const index=await loadTrendIndex();
  const snapshots=index?.snapshots||[];
  const requested=params.snapshot || params.date;
  const selected=requested && snapshots.some(row=>row.run_stamp===requested || row.run_stamp.startsWith(requested))
    ? requested
    : snapshots[0]?.run_stamp;
  const [data,reviewIntelligence]=await Promise.all([
    loadTrendRadar(selected),
    loadReviewIntelligence()
  ]);
  return <TrendObservationView data={data} snapshots={snapshots} reviewIntelligence={reviewIntelligence} initialView={initialView} />;
}
