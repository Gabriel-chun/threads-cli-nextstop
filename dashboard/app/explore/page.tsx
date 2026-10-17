import { ExplorationWorkspace } from "../../components/ExplorationWorkspace";
import { buildExplorationObjects } from "../../lib/explorationObjects";
import {loadKeywordNetwork} from "../../lib/keywordNetwork";
import {loadReviewIntelligence,loadTrendRadar} from "../../lib/trendRadar";
export const dynamic="force-dynamic";
export default async function ExplorePage(){
  const [review,trend,network]=await Promise.all([
    loadReviewIntelligence().catch(()=>null),
    loadTrendRadar().catch(()=>null),
    loadKeywordNetwork().catch(()=>null)
  ]);
  return <ExplorationWorkspace items={buildExplorationObjects({review,trend,network})}/>;
}
