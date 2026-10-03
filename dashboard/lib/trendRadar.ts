export type LinkState = "new" | "repeated" | "persistent" | "expanding" | "dormant";
export type ResolutionConfidence = "high" | "medium" | "low" | "unresolved";

export type TrendEvidence = {
  evidence_id:string;
  sample_id:string;
  observed_at:string;
  posted_at?:string|null;
  source_url:string;
  text:string;
  language_context:string;
  author_hash:string;
  query_family:string;
  raw_query:string;
  annotation:{
    artists:Array<{id:string;label:string}>;
    event:{id:string;label:string}|null;
    venues:Array<{id:string;label:string;city?:string|null}>;
    cities:string[];
    dates:string[];
    resolution_confidence:ResolutionConfidence;
    mobility:Array<{id:string;label:string;terms?:string[]}>;
    timing:Array<{id:string;label:string;terms?:string[]}>;
    stay:Array<{id:string;label:string;terms?:string[]}>;
    keywords:string[];
  };
};

export type TrendEntity = {
  entity_id:string;
  entity_type:"artist"|"event"|"venue"|"mobility"|"timing"|"stay"|string;
  label:string;
  evidence_ids:string[];
};

export type TrendLink = {
  link_id:string;
  source_type:string;
  source_id:string;
  source_label:string;
  target_type:string;
  target_id:string;
  target_label:string;
  relation_type:string;
  resolution_confidence:ResolutionConfidence;
  state:LinkState;
  first_seen:string;
  last_seen:string;
  sample_count:number;
  evidence_count:number;
  current_evidence_count:number;
  unique_author_count:number;
  evidence_ids:string[];
  current_evidence_ids:string[];
  consecutive_windows:number;
  supporting_evidence?:TrendEvidence[];
};

export type EventWatchRow = {
  event_id:string;
  artist_id:string;
  artist_name:string;
  event_name:string;
  event_date:string;
  venue_id:string;
  venue_name:string;
  city:string;
  source:string;
  status:string;
  linked_evidence:string[];
  linked_mobility:string[];
  linked_timing:string[];
  linked_stay:string[];
};

export type TrendObservationV02 = {
  schema_version:"trend-observation-v0.2";
  generated_at:string;
  run_stamp:string;
  window:string;
  sample:{
    sample_id:string;
    run_stamp:string;
    window_start:string;
    window_end:string;
    sampling_strategy:"need_led_observation";
    query_family:string[];
    language_context:string[];
    queries_executed:string[];
    raw_count:number;
    clean_count:number;
    generated_at:string;
  };
  language_distribution:Record<string,number>;
  evidence:TrendEvidence[];
  entities:TrendEntity[];
  links:TrendLink[];
  link_states:Record<LinkState,{count:number;link_ids:string[]}>;
  link_chains:Array<{evidence_id:string;chain:string[]}>;
  event_watch:EventWatchRow[];
  comparison:{
    previous_run_stamp?:string|null;
    new_entities:string[];
    repeated_entities:string[];
    new_links:string[];
    repeated_links:string[];
    dormant_links:string[];
    sample_size_change:{raw:number;clean:number};
  };
  artist_seed_count:number;
  event_candidate_count:number;
  query_count:number;
  raw_result_count:number;
  clean_result_count:number;
  active_edge_count:number;
  events:any[];
  edges:any[];
};

export type LegacyTrendRadar = {
  schema_version:"trend-radar-v0.1";
  generated_at:string;
  run_stamp:string;
  window:string;
  artist_seed_count:number;
  event_candidate_count:number;
  query_count:number;
  raw_result_count:number;
  clean_result_count:number;
  active_edge_count:number;
  status_counts:{observe:number;watch:number;active:number};
  events:Array<any>;
  edges:Array<any>;
  supporting_evidence:Array<any>;
};

export type TrendRadar = TrendObservationV02 | LegacyTrendRadar;

export type TrendIndexRow = {
  run_stamp:string;
  generated_at:string;
  path:string;
  schema_version?:string;
  sampling_strategy?:string;
  raw_count?:number;
  clean_count?:number;
  evidence_count?:number;
  event_candidate_count:number;
  link_count?:number;
  edge_count:number;
};

export type TrendIndex = {
  schema_version:string;
  updated_at?:string;
  baseline?:{run_stamp:string;sampling_strategy:string};
  snapshots:TrendIndexRow[];
};

const RAW="https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/trends";

async function read<T>(url:string):Promise<T|null>{
  const r=await fetch(url,{headers:{"User-Agent":"next-stop-live-trend-observation"},cache:"no-store"});
  return r.ok ? await r.json() as T : null;
}

export async function loadTrendIndex():Promise<TrendIndex|null>{
  return read<TrendIndex>(RAW+"/index.json");
}

export async function loadTrendRadar(selector?:string):Promise<TrendRadar|null>{
  if(selector){
    const index=await loadTrendIndex();
    const row=index?.snapshots.find(x=>x.run_stamp===selector)
      || index?.snapshots.find(x=>x.run_stamp.startsWith(selector));
    if(row) return read<TrendRadar>("https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/"+row.path);
  }
  return read<TrendRadar>(RAW+"/latest.json");
}

export function isTrendObservation(data:TrendRadar|null):data is TrendObservationV02{
  return Boolean(data && data.schema_version==="trend-observation-v0.2");
}
