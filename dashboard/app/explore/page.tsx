import { ExplorationWorkspace } from "../../components/ExplorationWorkspace";
import { buildExplorationObjects } from "../../lib/explorationObjects";
import {aggregateKeywordNetworks,calendarNetworkDate} from "../../lib/keywordNetworkHistory";
import {loadKeywordNetworkIndex,loadKeywordNetwork} from "../../lib/keywordNetwork";
import {loadReviewIntelligence,loadTrendRadar} from "../../lib/trendRadar";
export const dynamic="force-dynamic";
export default async function ExplorePage(){
  const [review,trend,network,index]=await Promise.all([
    loadReviewIntelligence().catch(()=>null),
    loadTrendRadar().catch(()=>null),
    loadKeywordNetwork().catch(()=>null),
    loadKeywordNetworkIndex().catch(()=>null)
  ]);
  const anchor=network?.network_date;
  const dates=new Set(index?.snapshots.map(x=>x.network_date)||[]);
  const historical=anchor?await Promise.all(Array.from({length:7},(_,i)=>{
    const date=calendarNetworkDate(anchor,-i);
    return dates.has(date)?loadKeywordNetwork(date).then(snapshot=>({date,snapshot})).catch(()=>({date,snapshot:null})):Promise.resolve({date,snapshot:null});
  })):[];
  const overlays=anchor?({
    1:aggregateKeywordNetworks(historical,anchor,1),
    3:aggregateKeywordNetworks(historical,anchor,3),
    7:aggregateKeywordNetworks(historical,anchor,7)
  }):null;
  return <ExplorationWorkspace items={buildExplorationObjects({review,trend,network})} overlays={overlays}/>;
}
