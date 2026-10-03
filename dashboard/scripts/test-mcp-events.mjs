const url=process.env.MCP_TEST_URL||"http://127.0.0.1:3100/api/mcp";
const meta={
  "io.modelcontextprotocol/protocolVersion":"2026-07-28",
  "io.modelcontextprotocol/clientInfo":{name:"nextstop-ci",version:"1.0.0"},
  "io.modelcontextprotocol/clientCapabilities":{}
};

async function rpc(id,method,params={}){
  const res=await fetch(url,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Accept":"application/json, text/event-stream",
      "MCP-Protocol-Version":"2026-07-28",
      "Mcp-Method":method,
      ...(params?.name ? {"Mcp-Name":params.name} : {})
    },
    body:JSON.stringify({jsonrpc:"2.0",id,method,params:{...params,_meta:meta}})
  });
  const text=await res.text();
  if(!res.ok) throw new Error(method+" HTTP "+res.status+": "+text);
  try{return JSON.parse(text);}catch{
    const line=text.split("\n").find(x=>x.startsWith("data:"));
    if(!line) throw new Error("unparseable "+method+": "+text);
    return JSON.parse(line.slice(5).trim());
  }
}

const discover=await rpc(1,"server/discover");
if(!discover.result?.supportedVersions?.includes("2026-07-28")) throw new Error("missing 2026-07-28");
if(!discover.result?.capabilities?.events) throw new Error("events capability missing");

const listed=await rpc(2,"events/list",{cursor:null});
const events=listed.result?.events||[];
if(events.length!==1||events[0].name!=="nextstop.observation.bundle.ready") {
  throw new Error("unexpected event catalog: "+JSON.stringify(events));
}

const tools=await rpc(3,"tools/list");
const names=(tools.result?.tools||[]).map(x=>x.name);
for(const name of [
  "get_recent_signals","get_demand_clusters","get_signal_detail",
  "get_collector_health","get_trend_history","get_observation_bundle",
  "get_signal_deck","get_keyword_network","get_trend_radar",
  "get_trend_observation","get_trend_connections","get_event_watch","get_trend_evidence",
  "get_latest_download","get_reviewed_cards_download"
]) if(!names.includes(name)) throw new Error("missing tool "+name);

const trend=await rpc(4,"tools/call",{name:"get_trend_radar",arguments:{}});
const trendText=trend.result?.content?.find?.(x=>x.type==="text")?.text;
if(!trendText) throw new Error("get_trend_radar returned no text content");
const trendData=JSON.parse(trendText);
if(!["trend-radar-v0.1","trend-observation-v0.2"].includes(trendData.schema_version)) throw new Error("unexpected trend schema: "+trendData.schema_version);
if(!Array.isArray(trendData.events)) throw new Error("trend events compatibility field missing");
if(trendData.schema_version==="trend-observation-v0.2"){
  if(trendData.sample?.sampling_strategy!=="need_led_observation") throw new Error("unexpected sampling strategy");
  if(!Array.isArray(trendData.evidence)||!Array.isArray(trendData.links)||!Array.isArray(trendData.event_watch)) throw new Error("V0.2 canonical datasets missing");
}

console.log(JSON.stringify({
  protocol:"2026-07-28",
  event:events[0].name,
  tools:names.sort(),
  trend:{schema:trendData.schema_version,run_stamp:trendData.run_stamp,events:trendData.event_candidate_count,links:trendData.links?.length??trendData.active_edge_count}
}));
