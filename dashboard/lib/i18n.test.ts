import test from "node:test";
import assert from "node:assert/strict";
import { dictionaries, dictionaryKeys, translate } from "./i18n";

test("zh-TW and en dictionaries have identical key coverage", () => {
  assert.deepEqual(dictionaryKeys("zh-TW"), dictionaryKeys("en"));
});

test("critical global and trend terminology is present in both locales", () => {
  const required=[
    "nav.signalDesk","nav.keywordNetwork","nav.trendObservation","nav.reviewLedger",
    "trend.title","trend.currentSample","trend.tab.connections","trend.tab.eventWatch",
    "trend.observedEntities","trend.observedNeeds","trend.newConnections","trend.repeatedConnections",
    "trend.persistentConnections","trend.expandingConnections","trend.dormantConnections",
    "trend.supportingEvidence","trend.observedAt","trend.postedAt","common.language","common.queryFamily",
    "trend.resolvedArtist","trend.resolvedEvent","trend.resolutionConfidence","common.source",
    "deck.window.1d","deck.window.3d","deck.window.5d","trend.confidence.high","trend.confidence.unresolved","common.error","common.retry"
  ];
  for(const locale of ["zh-TW","en"] as const){
    for(const key of required) assert.ok(dictionaries[locale][key], locale+" missing "+key);
  }
});

test("canonical link states map only in presentation", () => {
  assert.equal(translate("en","trend.state.new"),"New");
  assert.equal(translate("zh-TW","trend.state.new"),"新出現");
  assert.equal(translate("en","trend.state.dormant"),"Dormant");
  assert.equal(translate("zh-TW","trend.state.dormant"),"暫未出現");
});
