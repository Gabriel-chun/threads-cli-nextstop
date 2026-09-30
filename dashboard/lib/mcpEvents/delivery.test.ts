import assert from "node:assert/strict";
import test from "node:test";
import type { EventState } from "./core";
import { dispatchObservationEvent } from "./delivery";

class MemoryStore {
  state=new Map<string,EventState>(); locked=new Set<string>();
  async acquireEventLock(id:string){if(this.locked.has(id))return false;this.locked.add(id);return true;}
  async releaseEventLock(id:string){this.locked.delete(id);}
  async getEventState(id:string){return this.state.get(id)||null;}
  async putEventState(s:EventState){this.state.set(s.eventId,structuredClone(s));}
  async listSubscriptions(){return [];}
}
const event:any={
  eventId:"concert:2026-09-30_020000Z:clean-v2.1",
  name:"nextstop.observation.bundle.ready",
  timestamp:"2026-09-30T02:00:00Z",
  data:{run_id:"2026-09-30_020000Z",observation_id:"concert:2026-09-30_020000Z:clean-v2.1",pipeline_version:"clean-v2.1",bundle_ref:"collector/archive/observations/2026-09-30_020000Z.json",provenance:"scheduled",baseline_eligible:true},
  cursor:null
};

test("duplicate event is accepted once persistently",async()=>{
  const store=new MemoryStore();
  const first=await dispatchObservationEvent(event,store as any);
  const second=await dispatchObservationEvent(event,store as any);
  assert.equal(first.state?.finalStatus,"no_subscribers");
  assert.equal(second.duplicate,true);
  assert.equal(second.state?.finalStatus,"no_subscribers");
});
