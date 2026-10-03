import unittest
from datetime import date, datetime, timezone
from collector.trend_tracking.generate_queries import build_plan
from collector.trend_tracking.build_trend_snapshot import dedupe, norm, matched_concepts, resolve, build_snapshot

ARTISTS=[{"artist_id":"artist:fujii_kaze","canonical_name":"藤井風","aliases":["Fujii Kaze","藤井風","風哥"]}]
VENUES=[{"venue_id":"venue:kaohsiung_national_stadium","canonical_name":"高雄國家體育場","aliases":["世運主場館","高雄國家體育場"],"city":"高雄"}]
EVENTS=[{"event_id":"event:fujii_kaze_kaohsiung_20261031","artist_id":"artist:fujii_kaze","artist_name":"藤井風","event_name":"Fujii Kaze Prema World Tour - Kaohsiung","event_date":"2026-10-31","venue_id":"venue:kaohsiung_national_stadium","venue_name":"高雄國家體育場","city":"高雄","source":"x","status":"candidate"}]
AXES={"mobility":[{"id":"mobility:hsr","label":"高鐵","terms":["高鐵","HSR"]}],"timing":[{"id":"timing:after_show","label":"散場","terms":["散場"]},{"id":"timing:feasibility","label":"來得及","terms":["來得及"]}],"stay":[{"id":"stay:lodging","label":"住宿／飯店","terms":["住宿","飯店"]}]}

class TrendTrackingTests(unittest.TestCase):
    def test_query_budget_is_bounded_and_need_led(self):
        plan=build_plan(date(2026,10,3),18)
        self.assertEqual(plan["sampling_strategy"],"need_led_observation")
        self.assertLessEqual(plan["query_count"],18); self.assertGreater(plan["query_count"],0)
        self.assertEqual(len({q["query"] for q in plan["queries"]}),plan["query_count"])
        self.assertTrue(all("藤井風" not in q["query"] for q in plan["queries"]))
        self.assertTrue(all(q.get("semantic_query") for q in plan["queries"]))
        self.assertTrue(all("演唱會" not in q["query"] for q in plan["queries"] if q["language_context"]=="zh-Hant"))
        self.assertEqual(plan["retrieval_semantics"],"need_first_context_gated")

    def test_same_author_near_duplicate_is_suppressed(self):
        rows=[{"id":"1","username":"a","text":"藤井風 高鐵 怎麼回去","permalink":"u1","timestamp":"2026-10-03T01:00:00Z"},{"id":"2","username":"a","text":"藤井風高鐵怎麼回去！","permalink":"u2","timestamp":"2026-10-03T01:01:00Z"},{"id":"3","username":"b","text":"藤井風 高鐵 怎麼回去","permalink":"u3","timestamp":"2026-10-03T01:02:00Z"}]
        self.assertEqual(len(dedupe(rows)),2)

    def test_normalization_removes_noise_not_meaning(self):
        self.assertEqual(norm("#SKZ 末班車?"),"skz末班車")

    def test_entity_resolution_requires_grounding(self):
        r=resolve("10/31 藤井風高雄場散場後高鐵來得及嗎？",ARTISTS,VENUES,EVENTS)
        self.assertEqual(r["event"]["id"],EVENTS[0]["event_id"]); self.assertEqual(r["resolution_confidence"],"high")
        needs,_=matched_concepts("散場後高鐵來得及嗎？",AXES)
        self.assertEqual(needs["mobility"][0]["id"],"mobility:hsr"); self.assertTrue(needs["timing"])

    def test_context_gate_excludes_unrelated_need_hits(self):
        plan={"query_count":1,"retrieval_semantics":"need_first_context_gated","event_context_terms":["演唱會","concert"],"queries":[{"query":"高鐵","semantic_query":"高鐵 演唱會","family":"mobility_hsr","axis":"mobility","language_context":"zh-Hant"}]}
        raw=[
            {"id":"keep","username":"a","text":"演唱會散場後高鐵來得及嗎？","permalink":"u-keep","timestamp":"2026-10-03T01:00:00Z","query":"高鐵"},
            {"id":"drop","username":"b","text":"今天搭高鐵去台中開會","permalink":"u-drop","timestamp":"2026-10-03T01:01:00Z","query":"高鐵"}
        ]
        snapshot=build_snapshot(raw,plan,ARTISTS,VENUES,EVENTS,AXES,{},"2026-10-03_010000Z",datetime(2026,10,3,1,tzinfo=timezone.utc))
        self.assertEqual(snapshot["sample"]["raw_count"],2)
        self.assertEqual(snapshot["sample"]["clean_count"],1)
        self.assertEqual(snapshot["sample"]["context_excluded_count"],1)
        self.assertEqual(snapshot["evidence"][0]["semantic_query"],"高鐵 演唱會")

    def test_context_gate_rejects_movie_performance_language(self):
        plan={"query_count":1,"retrieval_semantics":"need_first_context_gated","event_context_terms":["演唱會","concert"],"queries":[{"query":"散場","semantic_query":"演唱會 散場","family":"timing_dispersal","axis":"timing","language_context":"zh-Hant"}]}
        raw=[{"id":"movie","username":"a","text":"整場只有我跟另一個男的，散場後覺得導演劇本演員都是完美演出，這是今年最好看的電影","permalink":"u-movie","timestamp":"2026-10-03T01:00:00Z","query":"散場"}]
        snapshot=build_snapshot(raw,plan,ARTISTS,VENUES,EVENTS,AXES,{},"2026-10-03_010000Z",datetime(2026,10,3,1,tzinfo=timezone.utc))
        self.assertEqual(snapshot["sample"]["raw_count"],1)
        self.assertEqual(snapshot["sample"]["clean_count"],0)
        self.assertEqual(snapshot["sample"]["context_excluded_count"],1)
        self.assertEqual(snapshot["evidence"],[])

    def test_evidence_language_comes_from_source_text(self):
        plan={"query_count":1,"retrieval_semantics":"need_first_context_gated","event_context_terms":["演唱會"],"queries":[{"query":"train","semantic_query":"concert train","family":"mobility_train_en","axis":"mobility","language_context":"English"}]}
        raw=[{"id":"lang1","username":"a","text":"演唱會散場後高鐵來得及嗎？","permalink":"u-lang","timestamp":"2026-10-03T01:00:00Z","query":"train"}]
        snapshot=build_snapshot(raw,plan,ARTISTS,VENUES,EVENTS,AXES,{},"2026-10-03_010000Z",datetime(2026,10,3,1,tzinfo=timezone.utc))
        self.assertEqual(snapshot["evidence"][0]["language_context"],"zh-Hant")
        self.assertEqual(snapshot["evidence"][0]["sampling_language_context"],"English")

    def test_cross_snapshot_state_and_dormant(self):
        plan={"query_count":1,"retrieval_semantics":"need_first_context_gated","event_context_terms":["演唱會"],"queries":[{"query":"高鐵","semantic_query":"高鐵 演唱會","family":"mobility_hsr","axis":"mobility","language_context":"zh-Hant"}]}
        raw=[{"id":"1","username":"a","text":"10/31 藤井風高雄場高鐵來得及嗎","permalink":"u1","timestamp":"2026-10-03T01:00:00Z","query":"高鐵"}]
        first=build_snapshot(raw,plan,ARTISTS,VENUES,EVENTS,AXES,{},"2026-10-03_010000Z",datetime(2026,10,3,1,tzinfo=timezone.utc))
        self.assertEqual(first["schema_version"],"trend-observation-v0.2"); self.assertTrue(any(l["state"]=="new" for l in first["links"]))
        second=build_snapshot(raw,plan,ARTISTS,VENUES,EVENTS,AXES,first,"2026-10-03_090000Z",datetime(2026,10,3,9,tzinfo=timezone.utc))
        self.assertTrue(any(l["state"]=="repeated" for l in second["links"]))
        third=build_snapshot([],plan,ARTISTS,VENUES,EVENTS,AXES,second,"2026-10-03_170000Z",datetime(2026,10,3,17,tzinfo=timezone.utc))
        self.assertTrue(any(l["state"]=="dormant" for l in third["links"]))

if __name__=="__main__": unittest.main()
