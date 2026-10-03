import test from "node:test";
import assert from "node:assert/strict";
import { dictionaries, dictionaryKeys, translate, translateDataLabel } from "./i18n";

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
    "deck.window.1d","deck.window.3d","deck.window.5d","trend.confidence.high","trend.confidence.unresolved","common.error","common.retry",
    "signal.eyebrow","network.eyebrow","reviews.eyebrow","trend.eyebrow","signal.chart.rolling3h","signal.chart.empty","reviews.filterAria","common.dashboardNav"
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


test("canonical data values stay canonical while display labels localize", () => {
  assert.equal(translateDataLabel("zh-TW","票務／入場摩擦"),"票務／入場摩擦");
  assert.equal(translateDataLabel("en","票務／入場摩擦"),"Ticketing / Entry Friction");
  assert.equal(translateDataLabel("en","unknown-machine-value"),"unknown-machine-value");
});
