import assert from "node:assert/strict";
import test from "node:test";
import { buildObservationEvent, deriveSubscriptionId, isEligibleObservationBundle, shouldNotifyDecision } from "./core";

const make=(provenance:string,eligible:boolean,status="success")=>({
  observation_id:"concert:2026-09-30_020000Z:clean-v2.1",
  run:{run_stamp:"2026-09-30_020000Z",run_at:"2026-09-30T02:00:00Z",status,pipeline_version:"clean-v2.1",provenance,baseline_eligible:eligible}
});

test("scheduled eligible emits thin event",()=>{
  const b=make("scheduled",true);
  assert.equal(isEligibleObservationBundle(b),true);
  const e=buildObservationEvent(b);
  assert.equal(e.name,"nextstop.observation.bundle.ready");
  assert.equal(e.data.run_id,"2026-09-30_020000Z");
  assert.equal(e.data.baseline_eligible,true);
  assert.equal(Object.keys(e.data).includes("evidence"),false);
});

test("smoke manual unknown failed do not emit",()=>{
  assert.equal(isEligibleObservationBundle(make("smoke",false)),false);
  assert.equal(isEligibleObservationBundle(make("manual",false)),false);
  assert.equal(isEligibleObservationBundle(make("unknown",false)),false);
  assert.equal(isEligibleObservationBundle(make("scheduled",true,"failed")),false);
});

test("subscription id is stable",()=>{
  assert.equal(
    deriveSubscriptionId("p","https://example.com/cb","e",{b:2,a:1}),
    deriveSubscriptionId("p","https://example.com/cb","e",{a:1,b:2})
  );
});

test("notification boundary",()=>{
  assert.equal(shouldNotifyDecision("no_change"),false);
  assert.equal(shouldNotifyDecision("watch"),false);
  assert.equal(shouldNotifyDecision("notable"),true);
  assert.equal(shouldNotifyDecision("data_quality_issue"),true);
});
