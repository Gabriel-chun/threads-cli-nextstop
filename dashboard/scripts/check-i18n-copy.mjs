import { readFile } from "node:fs/promises";

const files=[
  "app/page.tsx",
  "app/network/page.tsx",
  "app/reviews/page.tsx",
  "app/trends/page.tsx",
  "components/SignalReel.tsx",
  "components/ReviewLedger.tsx",
  "components/KeywordNetworkView.tsx",
  "components/TrendObservationView.tsx",
  "app/loading.tsx",
  "app/error.tsx"
];

const forbiddenRanking=["Trending / Watch Events","Active Trend","Trend Ranking","爆紅","熱門第一","暴增","趨勢霸榜"];
const forbiddenPresentation=["GitHub archive</small>","broad query</small>","resale excluded</small>","human selected</small>","human excluded</small>"," classified candidates</small>","} cards</small>"];
const problems=[];
for(const path of files){
  const text=await readFile(new URL("../"+path,import.meta.url),"utf8");
  if(/[\u3400-\u9fff]/.test(text)) problems.push(path+": contains hard-coded CJK production UI copy");
  for(const phrase of forbiddenRanking){
    if(text.includes(phrase)) problems.push(path+": forbidden ranking wording: "+phrase);
  }
  for(const phrase of forbiddenPresentation){
    if(text.includes(phrase)) problems.push(path+": hard-coded presentation copy: "+phrase);
  }
}
if(problems.length){
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("[i18n-copy] production UI copy is routed through the shared dictionary; evidence/proper nouns remain data-driven");
