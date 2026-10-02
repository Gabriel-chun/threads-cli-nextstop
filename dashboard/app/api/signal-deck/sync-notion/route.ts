import { z } from "zod";
import { syncSignalReviewsToNotion } from "../../../../lib/signalDeckNotion.server";
import type { SignalDeckFeedback } from "../../../../lib/signalDeckFeedback";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const bodySchema=z.object({rows:z.array(z.any()).min(1).max(10)});
function sameOrigin(request:Request){const origin=request.headers.get("origin"),host=request.headers.get("host"),site=request.headers.get("sec-fetch-site");if(site&&!["same-origin","same-site","none"].includes(site))return false;if(!origin||!host)return true;try{return new URL(origin).host===host}catch{return false}}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Cross-site review sync is not allowed."},{status:403});
  let rows:SignalDeckFeedback[];try{rows=bodySchema.parse(await request.json()).rows as SignalDeckFeedback[]}catch{return Response.json({error:"Invalid review sync payload."},{status:400})}
  try{return Response.json({ok:true,...await syncSignalReviewsToNotion(rows),archive_status:"pending_daily_github_archive"})}
  catch(error){
    console.error("[signal-deck/sync-notion] server-side Notion sync failed", error);
    return Response.json({error:"Notion 同步暫時不可用，請稍後再試。"}, {status:503});
  }
}