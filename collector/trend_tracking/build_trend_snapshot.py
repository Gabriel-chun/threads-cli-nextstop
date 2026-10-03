#!/usr/bin/env python3
import argparse, hashlib, json, re, unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path

def norm(text):
    text=unicodedata.normalize("NFKC",str(text or "")).lower()
    text=re.sub(r"https?://\S+"," ",text)
    text=re.sub(r"[@#]","",text)
    return re.sub(r"[^0-9a-z\u3400-\u9fff]+","",text)

def soft(text):
    return unicodedata.normalize("NFKC",str(text or "")).lower()

def parse_ts(v):
    try:
        s=str(v or "")
        if s.endswith("Z"): s=s[:-1]+"+00:00"
        d=datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def stable_id(prefix,*parts):
    raw="|".join(str(x or "") for x in parts)
    return prefix+hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def load_rows(raw_dir):
    rows=[]
    for path in sorted(Path(raw_dir).glob("query_*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip(): continue
            try: rows.append(json.loads(line))
            except json.JSONDecodeError: pass
    return rows

def dedupe(rows):
    exact=set(); kept=[]; author_groups=defaultdict(list)
    for row in sorted(rows,key=lambda r: parse_ts(r.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc)):
        key=str(row.get("permalink") or row.get("id") or "")
        if key and key in exact: continue
        if key: exact.add(key)
        author=str(row.get("username") or "").strip().lower()
        n=norm(row.get("text"))
        duplicate=False
        for prior in author_groups[author][-8:]:
            if n and (n==prior or SequenceMatcher(None,n,prior,autojunk=False).ratio()>=0.90):
                duplicate=True; break
        if duplicate: continue
        author_groups[author].append(n)
        kept.append(row)
    return kept

def has_term(text,term):
    return soft(term) in soft(text)

def matched_concepts(text,axes):
    out={}; keywords=[]
    for axis,concepts in axes.items():
        hits=[]
        for concept in concepts:
            matched=[term for term in concept.get("terms",[]) if has_term(text,term)]
            if matched:
                hits.append({"id":concept["id"],"label":concept["label"],"terms":matched})
                keywords.extend(matched)
        out[axis]=hits
    return out,sorted(set(keywords))

def match_named(text,items,name_key):
    lower=soft(text); hits=[]
    for item in items:
        names=[item.get(name_key,"")]+list(item.get("aliases",[]))
        if any(soft(name) in lower for name in names if name): hits.append(item)
    return hits

def extract_date_tokens(text,event_dates):
    tokens=set()
    for month,day in re.findall(r"(?<!\d)(\d{1,2})[\/.\-](\d{1,2})(?!\d)",text):
        key=f"{int(month):02d}-{int(day):02d}"; matched=[d for d in event_dates if d[5:]==key]
        tokens.update(matched or [key])
    for month,day in re.findall(r"(\d{1,2})月(\d{1,2})日?",text):
        key=f"{int(month):02d}-{int(day):02d}"; matched=[d for d in event_dates if d[5:]==key]
        tokens.update(matched or [key])
    for d in event_dates:
        if d in text: tokens.add(d)
    return sorted(tokens)

def resolve(text,artists,venues,events):
    artist_hits=match_named(text,artists,"canonical_name")
    venue_hits=match_named(text,venues,"canonical_name")
    lower=soft(text)
    city_hits=sorted({e.get("city") for e in events if e.get("city") and soft(e["city"]) in lower} | {v.get("city") for v in venue_hits if v.get("city")})
    event_dates=[e["event_date"] for e in events if e.get("event_date")]
    date_hits=extract_date_tokens(text,event_dates)
    event_name_hits=[e for e in events if e.get("event_name") and soft(e["event_name"]) in lower]
    resolved_event=None; confidence="unresolved"
    if event_name_hits:
        resolved_event=event_name_hits[0]; confidence="high"
    elif artist_hits:
        artist_ids={a["artist_id"] for a in artist_hits}
        candidates=[e for e in events if e.get("artist_id") in artist_ids]
        exact=[]
        for e in candidates:
            date_ok=e.get("event_date") in date_hits
            city_ok=e.get("city") in city_hits
            venue_ok=any(v.get("venue_id")==e.get("venue_id") for v in venue_hits)
            if date_ok and (city_ok or venue_ok): exact.append(e)
        if len(exact)==1:
            resolved_event=exact[0]; confidence="high"
        else:
            city_candidates=[e for e in candidates if e.get("city") in city_hits] if city_hits else []
            venue_candidates=[e for e in candidates if any(v.get("venue_id")==e.get("venue_id") for v in venue_hits)] if venue_hits else []
            reasonable=city_candidates or venue_candidates
            if len(reasonable)==1:
                resolved_event=reasonable[0]; confidence="medium"
            else:
                confidence="low"
    if resolved_event and not any(a["artist_id"]==resolved_event.get("artist_id") for a in artist_hits):
        artist_hits.extend([a for a in artists if a["artist_id"]==resolved_event.get("artist_id")])
    return {
        "artists":[{"id":a["artist_id"],"label":a["canonical_name"]} for a in artist_hits],
        "venues":[{"id":v["venue_id"],"label":v["canonical_name"],"city":v.get("city")} for v in venue_hits],
        "cities":city_hits,"dates":date_hits,
        "event":{"id":resolved_event["event_id"],"label":resolved_event["event_name"]} if resolved_event else None,
        "resolution_confidence":confidence,
    }

def add_entity(store,entity_id,entity_type,label,evidence_id):
    if not entity_id: return
    row=store.setdefault(entity_id,{"entity_id":entity_id,"entity_type":entity_type,"label":label,"evidence_ids":[]})
    if evidence_id not in row["evidence_ids"]: row["evidence_ids"].append(evidence_id)

def link_key(st,sid,tt,tid,rel):
    return stable_id("link:",st,sid,tt,tid,rel)

def candidate_links(evidence):
    ann=evidence["annotation"]; eid=evidence["evidence_id"]; out=[]
    needs=[(axis,c) for axis in ("mobility","timing","stay") for c in ann.get(axis,[])]
    def add(st,sid,sl,tt,tid,tl,rel,conf="high"):
        out.append({"link_id":link_key(st,sid,tt,tid,rel),"source_type":st,"source_id":sid,"source_label":sl,"target_type":tt,"target_id":tid,"target_label":tl,"relation_type":rel,"evidence_id":eid,"author_hash":evidence["author_hash"],"resolution_confidence":conf})
    for artist in ann.get("artists",[]):
        for axis,c in needs: add("artist",artist["id"],artist["label"],axis,c["id"],c["label"],f"artist_{axis}")
    event=ann.get("event")
    if event and ann.get("resolution_confidence") in {"high","medium"}:
        for axis,c in needs: add("event",event["id"],event["label"],axis,c["id"],c["label"],f"event_{axis}",ann["resolution_confidence"])
    for venue in ann.get("venues",[]):
        for axis,c in needs:
            if axis in {"mobility","timing"}: add("venue",venue["id"],venue["label"],axis,c["id"],c["label"],f"venue_{axis}")
    for m in ann.get("mobility",[]):
        for t in ann.get("timing",[]): add("mobility",m["id"],m["label"],"timing",t["id"],t["label"],"mobility_timing")
        for s in ann.get("stay",[]): add("mobility",m["id"],m["label"],"stay",s["id"],s["label"],"mobility_stay")
    for t in ann.get("timing",[]):
        for s in ann.get("stay",[]): add("timing",t["id"],t["label"],"stay",s["id"],s["label"],"timing_stay")
    return out

def aggregate_links(evidence,previous,now):
    current={}
    for ev in evidence:
        for c in candidate_links(ev):
            if c["link_id"] not in current:
                current[c["link_id"]]={k:c[k] for k in ["link_id","source_type","source_id","source_label","target_type","target_id","target_label","relation_type","resolution_confidence"]}
                current[c["link_id"]]["current_evidence_ids"]=[]; current[c["link_id"]]["current_author_hashes"]=[]
            row=current[c["link_id"]]
            if c["evidence_id"] not in row["current_evidence_ids"]: row["current_evidence_ids"].append(c["evidence_id"])
            if c["author_hash"] not in row["current_author_hashes"]: row["current_author_hashes"].append(c["author_hash"])
            if row["resolution_confidence"]=="medium" and c["resolution_confidence"]=="high": row["resolution_confidence"]="high"
    prev_links={x.get("link_id"):x for x in previous.get("links",[]) if x.get("link_id")} if previous.get("schema_version")=="trend-observation-v0.2" else {}
    prev_entity_ids=set()
    for p in prev_links.values():
        if p.get("source_type") in {"artist","event","venue"}: prev_entity_ids.add(p.get("source_id"))
        if p.get("target_type") in {"artist","event","venue"}: prev_entity_ids.add(p.get("target_id"))
    links=[]
    for lid,row in current.items():
        prev=prev_links.get(lid)
        if prev:
            consecutive=1 if prev.get("state")=="dormant" else int(prev.get("consecutive_windows",0))+1
            state="persistent" if consecutive>=3 else "repeated"
            evidence_ids=list(dict.fromkeys(list(prev.get("evidence_ids",[]))+row["current_evidence_ids"]))
            author_hashes=list(dict.fromkeys(list(prev.get("author_hashes",[]))+row["current_author_hashes"]))
            previous_support=list(prev.get("supporting_evidence",[]))
            sample_count=int(prev.get("sample_count",0))+1; first_seen=prev.get("first_seen") or now
        else:
            consecutive=1
            expanding=(row["source_type"] in {"artist","event","venue"} and row["source_id"] in prev_entity_ids) or (row["target_type"] in {"artist","event","venue"} and row["target_id"] in prev_entity_ids)
            state="expanding" if expanding else "new"
            evidence_ids=row["current_evidence_ids"][:]; author_hashes=row["current_author_hashes"][:]; previous_support=[]; sample_count=1; first_seen=now
        links.append({
            **{k:row[k] for k in ["link_id","source_type","source_id","source_label","target_type","target_id","target_label","relation_type","resolution_confidence"]},
            "state":state,"first_seen":first_seen,"last_seen":now,"sample_count":sample_count,
            "evidence_count":len(evidence_ids),"current_evidence_count":len(row["current_evidence_ids"]),
            "unique_author_count":len(author_hashes),"evidence_ids":evidence_ids,"current_evidence_ids":row["current_evidence_ids"],
            "author_hashes":author_hashes,"consecutive_windows":consecutive,
            "supporting_evidence":previous_support,
        })
    evidence_by_id={e["evidence_id"]:e for e in evidence}
    for link in links:
        current_support=[evidence_by_id[eid] for eid in link.get("current_evidence_ids",[]) if eid in evidence_by_id]
        merged={e.get("evidence_id"):e for e in link.get("supporting_evidence",[]) if e.get("evidence_id")}
        for e in current_support: merged[e["evidence_id"]]=e
        link["supporting_evidence"]=list(merged.values())[-20:]
    for lid,prev in prev_links.items():
        if lid not in current:
            links.append({**prev,"state":"dormant","current_evidence_count":0,"current_evidence_ids":[],"consecutive_windows":0,"supporting_evidence":list(prev.get("supporting_evidence",[]))[-20:]})
    order={"persistent":0,"repeated":1,"expanding":2,"new":3,"dormant":4}
    return sorted(links,key=lambda x:(order.get(x["state"],9),x["source_label"],x["target_label"]))

def build_snapshot(raw,plan,artists,venues,events,axes,previous,run_stamp,now_dt=None):
    now_dt=now_dt or datetime.now(timezone.utc); now=now_dt.isoformat().replace("+00:00","Z")
    clean=dedupe(raw); qmap={q["query"]:q for q in plan.get("queries",[])}
    sample_id="sample:"+run_stamp; evidence=[]; entities={}; lang_counts=defaultdict(int)
    for row in clean:
        query=str(row.get("query") or "").strip(); q=qmap.get(query,{})
        text=str(row.get("text") or ""); named=resolve(text,artists,venues,events); needs,keywords=matched_concepts(text,axes)
        evidence_id=stable_id("evidence:",sample_id,row.get("permalink") or row.get("id") or text[:160])
        author=str(row.get("username") or "").strip().lower()
        ev={"evidence_id":evidence_id,"sample_id":sample_id,"observed_at":now,"posted_at":row.get("timestamp"),"source_url":str(row.get("permalink") or ""),"text":text,"language_context":q.get("language_context","mixed"),"author_hash":stable_id("author:",author),"query_family":q.get("family","unresolved"),"raw_query":query,"annotation":{**named,"mobility":needs["mobility"],"timing":needs["timing"],"stay":needs["stay"],"keywords":keywords}}
        evidence.append(ev); lang_counts[ev["language_context"]]+=1
        for a in named["artists"]: add_entity(entities,a["id"],"artist",a["label"],evidence_id)
        if named["event"]: add_entity(entities,named["event"]["id"],"event",named["event"]["label"],evidence_id)
        for v in named["venues"]: add_entity(entities,v["id"],"venue",v["label"],evidence_id)
        for axis in ("mobility","timing","stay"):
            for c in needs[axis]: add_entity(entities,c["id"],axis,c["label"],evidence_id)
    links=aggregate_links(evidence,previous,now)
    state_ids={state:[] for state in ("new","repeated","persistent","expanding","dormant")}
    for link in links: state_ids.setdefault(link["state"],[]).append(link["link_id"])
    current_entity_ids=set(entities)
    previous_entity_ids=set(x.get("entity_id") for x in previous.get("entities",[]) if x.get("entity_id")) if previous.get("schema_version")=="trend-observation-v0.2" else set()
    previous_link_ids=set(x.get("link_id") for x in previous.get("links",[]) if x.get("link_id")) if previous.get("schema_version")=="trend-observation-v0.2" else set()
    current_observed_links={x["link_id"] for x in links if x["state"]!="dormant"}
    prev_sample=previous.get("sample",{}) if previous.get("schema_version")=="trend-observation-v0.2" else {}
    comparison={"previous_run_stamp":previous.get("run_stamp"),"new_entities":sorted(current_entity_ids-previous_entity_ids),"repeated_entities":sorted(current_entity_ids&previous_entity_ids),"new_links":sorted(current_observed_links-previous_link_ids),"repeated_links":sorted(current_observed_links&previous_link_ids),"dormant_links":sorted(previous_link_ids-current_observed_links),"sample_size_change":{"raw":len(raw)-int(prev_sample.get("raw_count",previous.get("raw_result_count",0) or 0)),"clean":len(clean)-int(prev_sample.get("clean_count",previous.get("clean_result_count",0) or 0))}}
    evidence_map={e["evidence_id"]:e for e in evidence}
    event_watch=[]
    for event in events:
        event_links=[l for l in links if l["source_type"]=="event" and l["source_id"]==event["event_id"] and l["state"]!="dormant"]
        evidence_ids=list(dict.fromkeys(eid for l in event_links for eid in l.get("current_evidence_ids",[])))
        event_watch.append({**event,"linked_evidence":evidence_ids,"linked_mobility":sorted({l["target_label"] for l in event_links if l["target_type"]=="mobility"}),"linked_timing":sorted({l["target_label"] for l in event_links if l["target_type"]=="timing"}),"linked_stay":sorted({l["target_label"] for l in event_links if l["target_type"]=="stay"})})
    event_watch.sort(key=lambda e:(e.get("event_date",""),e.get("artist_name","")))
    chains=[]
    for ev in evidence:
        ann=ev["annotation"]
        if ann.get("event") and ann.get("mobility") and ann.get("timing") and ann.get("stay"):
            chains.append({"evidence_id":ev["evidence_id"],"chain":[ann["event"]["id"],ann["timing"][0]["id"],ann["mobility"][0]["id"],ann["stay"][0]["id"]]})
    sample={"sample_id":sample_id,"run_stamp":run_stamp,"window_start":(now_dt-timedelta(hours=8)).isoformat().replace("+00:00","Z"),"window_end":now,"sampling_strategy":"need_led_observation","query_family":sorted({q.get("family") for q in plan.get("queries",[]) if q.get("family")}),"language_context":sorted({q.get("language_context") for q in plan.get("queries",[]) if q.get("language_context")}),"queries_executed":[q.get("query") for q in plan.get("queries",[]) if q.get("query")],"raw_count":len(raw),"clean_count":len(clean),"generated_at":now}
    current_event_links=[l for l in links if l["source_type"]=="event" and l["state"]!="dormant"]
    legacy_edges=[]
    for l in current_event_links:
        posts=[]
        for eid in l.get("current_evidence_ids",[])[:5]:
            e=evidence_map.get(eid)
            if e: posts.append({"id":eid,"username":"","text":e["text"][:500],"permalink":e["source_url"],"timestamp":e.get("posted_at")})
        legacy_edges.append({"source_entity":l["source_id"],"target_need":l["target_id"],"target_label":l["target_label"],"signal_count":l["current_evidence_count"],"unique_author_count":l["unique_author_count"],"authors":[],"first_seen":l["first_seen"],"last_seen":l["last_seen"],"window":"current_snapshot","change":0,"snapshot_persistence":l["consecutive_windows"],"supporting_posts":posts})
    legacy_events=[]
    for e in event_watch:
        event_links=[l for l in current_event_links if l["source_id"]==e["event_id"]]
        legacy_events.append({**e,"trend_status":"observe","signal_count":len(e["linked_evidence"]),"unique_author_count":len({h for l in event_links for h in l.get("author_hashes",[])}),"need_edge_count":len(event_links),"need_edges":[l["target_label"] for l in event_links],"last_updated":now})
    return {"schema_version":"trend-observation-v0.2","generated_at":now,"run_stamp":run_stamp,"window":"upcoming_90d","sample":sample,"language_distribution":dict(sorted(lang_counts.items())),"evidence":evidence,"entities":sorted(entities.values(),key=lambda x:(x["entity_type"],x["label"])),"links":links,"link_states":{state:{"count":len(ids),"link_ids":ids} for state,ids in state_ids.items()},"link_chains":chains,"event_watch":event_watch,"comparison":comparison,"artist_seed_count":len(artists),"event_candidate_count":len(events),"query_count":plan.get("query_count",len(plan.get("queries",[]))),"raw_result_count":len(raw),"clean_result_count":len(clean),"active_edge_count":len([l for l in links if l["state"]!="dormant"]),"status_counts":{"observe":len(events),"watch":0,"active":0},"events":legacy_events,"edges":legacy_edges,"supporting_evidence":evidence[:30],"legacy_semantics":"compatibility_only_no_ranking"}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--raw-dir",required=True); p.add_argument("--query-plan",required=True); p.add_argument("--artists",required=True); p.add_argument("--events",required=True); p.add_argument("--venues",required=True); p.add_argument("--needs",required=True); p.add_argument("--previous"); p.add_argument("--run-stamp",required=True); p.add_argument("--output",required=True)
    args=p.parse_args(); plan=load_json(args.query_plan); artists=load_json(args.artists)["artists"]; events=load_json(args.events)["events"]; venues=load_json(args.venues)["venues"]; axes=load_json(args.needs)["axes"]; previous={}
    if args.previous and Path(args.previous).exists():
        try: previous=load_json(args.previous)
        except Exception: previous={}
    payload=build_snapshot(load_rows(args.raw_dir),plan,artists,venues,events,axes,previous,args.run_stamp)
    Path(args.output).parent.mkdir(parents=True,exist_ok=True); Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("[trend-observation]",json.dumps({"run_stamp":payload["run_stamp"],"sampling_strategy":payload["sample"]["sampling_strategy"],"queries":payload["query_count"],"raw":payload["sample"]["raw_count"],"clean":payload["sample"]["clean_count"],"evidence":len(payload["evidence"]),"links":len(payload["links"]),"states":{k:v["count"] for k,v in payload["link_states"].items()}},ensure_ascii=False))
if __name__=="__main__": main()
