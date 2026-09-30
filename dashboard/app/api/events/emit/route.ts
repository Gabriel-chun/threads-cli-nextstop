import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { buildObservationEvent, isEligibleObservationBundle } from "../../../../lib/mcpEvents/core";
import { dispatchObservationEvent } from "../../../../lib/mcpEvents/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema=z.object({run_id:z.string().regex(/^\d{4}-\d{2}-\d{2}_\d{6}Z$/)});
const BASE="https://raw.githubusercontent.com/Gabriel-chun/threads-cli-nextstop/main/collector/archive/observations";

function authorized(request:Request) {
  const expected=process.env.NEXTSTOP_EVENT_EMIT_TOKEN||"";
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")||"";
  if(!expected||!supplied) return false;
  const a=Buffer.from(expected), b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function POST(request:Request) {
  if(!process.env.NEXTSTOP_EVENT_EMIT_TOKEN) {
    return Response.json({error:"NEXTSTOP_EVENT_EMIT_TOKEN is not configured."},{status:503});
  }
  if(!authorized(request)) return Response.json({error:"Unauthorized."},{status:401});

  let input:{run_id:string};
  try { input=schema.parse(await request.json()); }
  catch { return Response.json({error:"Invalid run_id."},{status:400}); }

  const res=await fetch(BASE+"/"+input.run_id+".json?phase2="+Date.now(),{
    cache:"no-store",headers:{"User-Agent":"next-stop-live-event-emitter"}
  });
  if(!res.ok) return Response.json({error:"Immutable observation artifact is not readable."},{status:409});
  const bundle=await res.json();
  if(bundle?.run?.run_stamp!==input.run_id) {
    return Response.json({error:"Observation artifact run_id mismatch."},{status:409});
  }
  if(!isEligibleObservationBundle(bundle)) {
    return Response.json({
      emitted:false,
      reason:"not_baseline_eligible_scheduled_success",
      run_id:input.run_id,
      provenance:bundle?.run?.provenance||"unknown",
      baseline_eligible:bundle?.run?.baseline_eligible===true
    },{status:202});
  }
  const event=buildObservationEvent(bundle);
  const delivery=await dispatchObservationEvent(event);
  console.log(JSON.stringify({
    kind:"mcp_event_dispatch",event_id:event.eventId,run_id:input.run_id,
    duplicate:delivery.duplicate,final_status:delivery.state?.finalStatus
  }));
  return Response.json({emitted:true,event:{event_id:event.eventId,name:event.name,run_id:event.data.run_id},delivery});
}
