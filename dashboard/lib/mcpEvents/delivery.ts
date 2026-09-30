import type { EventState, ObservationEvent } from "./core";
import { isSubscriptionActive } from "./core";
import { BlobEventStore } from "./store";
import { deliverEvent } from "./webhook";

const BACKOFF=[0,1000,4000];

export async function dispatchObservationEvent(
  event: ObservationEvent,
  store: BlobEventStore = new BlobEventStore()
) {
  if (!(await store.acquireEventLock(event.eventId))) {
    const state = await store.getEventState(event.eventId);
    return { duplicate:true, state };
  }
  try {
    let state = await store.getEventState(event.eventId);
    if (state?.finalStatus === "completed" || state?.finalStatus === "no_subscribers") {
      return { duplicate:true, state };
    }

    const subscriptions = (await store.listSubscriptions()).filter(
      (s) => isSubscriptionActive(s) && Date.parse(s.createdAt) <= Date.parse(event.timestamp)
    );

    if (!state) {
      const now=new Date().toISOString();
      state={
        eventId:event.eventId,
        runId:event.data.run_id,
        observationId:event.data.observation_id,
        occurredAt:event.timestamp,
        createdAt:now, updatedAt:now,
        targetSubscriptionIds:subscriptions.map((s)=>s.id),
        deliveries:Object.fromEntries(subscriptions.map((s)=>[
          s.id,{subscriptionId:s.id,status:"pending",attempts:0,updatedAt:now}
        ])),
        finalStatus:subscriptions.length ? "emitted" : "no_subscribers"
      } satisfies EventState;
      await store.putEventState(state);
    }
    if (!state.targetSubscriptionIds.length) return { duplicate:false, state };

    const byId=new Map(subscriptions.map((s)=>[s.id,s]));
    for (const id of state.targetSubscriptionIds) {
      const prior=state.deliveries[id];
      if (prior?.status === "delivered" || prior?.status === "skipped") continue;
      const sub=byId.get(id);
      if (!sub) {
        state.deliveries[id]={subscriptionId:id,status:"skipped",attempts:prior?.attempts||0,lastError:"subscription_missing_or_expired",updatedAt:new Date().toISOString()};
        await store.putEventState(state);
        continue;
      }
      let attempts=prior?.attempts||0, delivered=false, terminal=false;
      let lastHttp:number|null=null, lastError:string|null=null;
      while (!delivered && !terminal && attempts < 3) {
        if (BACKOFF[attempts]) await new Promise((r)=>setTimeout(r,BACKOFF[attempts]));
        attempts++;
        try {
          const res=await deliverEvent(sub,event);
          lastHttp=res.status;
          delivered=res.status>=200 && res.status<300;
          terminal=res.status===410 || res.status===413 ||
            (!delivered && res.status<500 && ![408,425,429].includes(res.status));
          if (!delivered) lastError="http_"+res.status;
        } catch (e) {
          lastError=e instanceof Error?e.message:"network_error";
        }
        state.deliveries[id]={subscriptionId:id,status:delivered?"delivered":"pending",attempts,lastHttpStatus:lastHttp,lastError,updatedAt:new Date().toISOString()};
        state.updatedAt=new Date().toISOString();
        await store.putEventState(state);
      }
      if (!delivered) {
        state.deliveries[id]={subscriptionId:id,status:"failed",attempts,lastHttpStatus:lastHttp,lastError,updatedAt:new Date().toISOString()};
        await store.putEventState(state);
      }
    }

    const values=Object.values(state.deliveries);
    state.finalStatus=values.some((d)=>d.status==="failed")?"partial_failure":"completed";
    state.updatedAt=new Date().toISOString();
    await store.putEventState(state);
    return { duplicate:false, state };
  } finally {
    await store.releaseEventLock(event.eventId);
  }
}
