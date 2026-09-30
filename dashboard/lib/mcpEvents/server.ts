import { McpServer, ProtocolError } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  EVENT_DEFINITION,
  OBSERVATION_EVENT_NAME,
  deriveSubscriptionId,
  normalizeSubscriptionExpiry,
  type SubscriptionRecord
} from "./core";
import { BlobEventStore } from "./store";
import { validateWebhookSecret, verifyCallback } from "./webhook";

const listSchema={params:z.object({cursor:z.string().nullable().optional()}),result:z.any()};
const subscribeParams=z.object({
  name:z.literal(OBSERVATION_EVENT_NAME),
  arguments:z.object({}).default({}),
  delivery:z.object({mode:z.literal("webhook"),url:z.string().url(),secret:z.string()}),
  cursor:z.null().optional(),
  ttlMs:z.number().int().positive().nullable().optional()
});
const unsubscribeParams=z.object({
  name:z.literal(OBSERVATION_EVENT_NAME),
  arguments:z.object({}).default({}),
  delivery:z.object({mode:z.literal("webhook"),url:z.string().url()})
});

function principal(ctx:any) {
  const auth=ctx?.http?.authInfo as any;
  return auth?.clientId ? "client:"+auth.clientId :
    auth?.subject ? "subject:"+auth.subject : "public-nextstop";
}

export function registerObservationEventHandlers(server:McpServer) {
  const low=server.server;
  low.setRequestHandler("events/list",listSchema as any,async()=>({events:[EVENT_DEFINITION]}));
  low.setRequestHandler(
    "events/subscribe",
    {params:subscribeParams,result:z.any()} as any,
    async(params:any,ctx:any)=>{
      const owner=principal(ctx);
      const id=deriveSubscriptionId(owner,params.delivery.url,params.name,params.arguments||{});
      const store=new BlobEventStore();
      try { validateWebhookSecret(params.delivery.secret); }
      catch(e) {
        throw new ProtocolError(-32015 as any,"CallbackEndpointError",{reason:"invalid_secret",message:e instanceof Error?e.message:"invalid_secret"});
      }
      try {
        if (!(await store.getVerification(owner,params.delivery.url))) {
          await verifyCallback(id,params.delivery.url,params.delivery.secret);
          await store.putVerification(owner,params.delivery.url);
        }
      } catch(e) {
        throw new ProtocolError(-32015 as any,"CallbackEndpointError",{reason:"challenge_failed",message:e instanceof Error?e.message:"verification_failed"});
      }
      const existing=await store.getSubscription(id);
      const now=new Date();
      const changed=Boolean(existing&&existing.secret!==params.delivery.secret);
      const record:SubscriptionRecord={
        id,principal:owner,name:OBSERVATION_EVENT_NAME,arguments:{},
        url:params.delivery.url,secret:params.delivery.secret,
        previousSecret:changed?existing?.secret:(existing?.previousSecret||null),
        previousSecretExpiresAt:changed?new Date(Date.now()+300000).toISOString():(existing?.previousSecretExpiresAt||null),
        createdAt:existing?.createdAt||now.toISOString(),
        updatedAt:now.toISOString(),
        expiresAt:normalizeSubscriptionExpiry(params.ttlMs),
        active:true
      };
      await store.putSubscription(record);
      return {id,refreshBefore:record.expiresAt,cursor:null,truncated:false};
    }
  );
  low.setRequestHandler(
    "events/unsubscribe",
    {params:unsubscribeParams,result:z.any()} as any,
    async(params:any,ctx:any)=>{
      const id=deriveSubscriptionId(principal(ctx),params.delivery.url,params.name,params.arguments||{});
      await new BlobEventStore().deleteSubscription(id);
      return {};
    }
  );
}
