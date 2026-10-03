export type TrendEdge = {
  source_entity: string;
  target_need: string;
  target_label: string;
  signal_count: number;
  unique_author_count: number;
  first_seen: string;
  last_seen: string;
  change: number;
  snapshot_persistence: number;
  supporting_posts: Array<{id:string;username:string;text:string;permalink:string;timestamp?:string}>;
};
export type TrendEvent = {
  event_id:string; artist_id:string; artist_name:string; event_name:string; event_date:string;
  venue_id:string; venue_name:string; city:string; source:string; status:string;
  trend_status:"observe"|"watch"|"active"; signal_count:number; unique_author_count:number;
  need_edge_count:number; need_edges:string[]; last_updated:string;
};
export type TrendRadar = {
  schema_version:"trend-radar-v0.1"; generated_at:string; run_stamp:string; window:string;
  artist_seed_count:number; event_candidate_count:number; query_count:number;
  raw_result_count:number; clean_result_count:number; active_edge_count:number;
  status_counts:{observe:number;watch:number;active:number}; events:TrendEvent[]; edges:TrendEdge[];
  supporting_evidence:TrendEdge["supporting_posts"];
};
const RAW="https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/trends";
async function read<T>(url:string):Promise<T|null>{
  const r=await fetch(url,{headers:{"User-Agent":"next-stop-live-trend-radar"},cache:"no-store"});
  return r.ok ? await r.json() as T : null;
}
export async function loadTrendRadar(date?:string):Promise<TrendRadar|null>{
  if(date && /^\d{4}-\d{2}-\d{2}$/.test(date)){
    const index=await loadTrendIndex();
    const row=index?.snapshots.find(x=>x.run_stamp.startsWith(date));
    if(row) return read<TrendRadar>(`https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/${row.path}`);
  }
  return read<TrendRadar>(RAW+"/latest.json");
}
export async function loadTrendIndex():Promise<{snapshots:Array<{run_stamp:string;generated_at:string;path:string;event_candidate_count:number;edge_count:number}>}|null>{
  return read(RAW+"/index.json");
}
