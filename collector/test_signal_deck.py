import unittest
from datetime import datetime, timezone

from collector.build_signal_deck import build_deck


class SignalDeckV03Tests(unittest.TestCase):
    def test_each_post_becomes_its_own_card(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "a",
                "text": "第一次參加 FEniX 演唱會，抽到合照資格，想問合照是坐著還是站著？",
                "username": "one",
                "permalink": "https://www.threads.com/@one/post/a",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "b",
                "text": "VIP 合照可以自己想動作嗎？有人有經驗嗎",
                "username": "two",
                "permalink": "https://www.threads.com/@two/post/b",
                "timestamp": "2026-09-30T23:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "c",
                "text": "演唱會散場捷運末班車來得及嗎？",
                "username": "three",
                "permalink": "https://www.threads.com/@three/post/c",
                "timestamp": "2026-09-29T09:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        deck = build_deck(posts, now)
        self.assertEqual(deck["schema_version"], "signal-deck-v0.4")
        self.assertEqual(deck["card_granularity"], "post")

        one_day = deck["windows"]["1d"]
        self.assertLessEqual(one_day["card_count"], 2)
        self.assertEqual(one_day["display_limit"], 5)
        self.assertEqual(one_day["default_review_limit"], one_day["card_count"])
        self.assertEqual(one_day["extend_step"], 10)
        self.assertTrue({card["post_id"] for card in one_day["cards"]}.issubset({"a", "b"}))
        self.assertEqual(len({card["post_key"] for card in one_day["cards"]}), one_day["card_count"])
        self.assertTrue(all(card["snapshot_id"].startswith("deck_2026-10-01_1d_") for card in one_day["cards"]))
        self.assertTrue(all("candidate_confidence" in card for card in one_day["cards"]))

        three_day_categories = {card["category"] for card in deck["windows"]["3d"]["cards"]}
        self.assertIn("交通／散場", three_day_categories)

    def test_resale_is_excluded_but_generic_fandom_post_is_kept_for_triage(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "sale",
                "text": "出兩張 BIGBANG 演唱會門票，原價出售，有意私訊",
                "username": "seller",
                "permalink": "https://www.threads.com/@seller/post/sale",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
            {
                "id": "fan",
                "text": "BIGBANG 演唱會真的太感動了，今天到現在還在回味。",
                "username": "fan",
                "permalink": "https://www.threads.com/@fan/post/fan",
                "timestamp": "2026-10-01T01:30:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
        ]

        deck = build_deck(posts, now)
        cards = deck["windows"]["1d"]["cards"]
        self.assertEqual(cards, [])

    def test_cp_narrative_is_not_deleted_and_gets_text_features(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        text = (
            "演唱會結束後他又溫柔地靠向對方，眼神一直盯著他，"
            "耳邊說了很多話，接著輕輕拉著肩膀靠近。"
            "這段 CP 互動真的讓人一直回想。"
        ) * 3
        posts = [{
            "id": "cp",
            "text": text,
            "username": "shipper",
            "permalink": "https://www.threads.com/@shipper/post/cp",
            "timestamp": "2026-10-01T02:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
        }]

        deck = build_deck(posts, now)
        self.assertEqual(deck["windows"]["1d"]["cards"], [])
        self.assertEqual(deck["windows"]["1d"]["low_confidence_count"], 1)


    def test_reserve_pool_can_exceed_default_review_limit(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = []
        for i in range(55):
            posts.append({
                "id": f"p{i}",
                "text": f"演唱會心得 {i}",
                "username": "fan",
                "permalink": f"https://www.threads.com/@fan/post/p{i}",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60 - (i / 100),
            })
        deck = build_deck(posts, now)
        one_day = deck["windows"]["1d"]
        self.assertEqual(one_day["card_count"], 0)
        self.assertEqual(one_day["low_confidence_count"], 55)
        self.assertEqual(one_day["default_review_limit"], 0)
        self.assertEqual(one_day["extend_step"], 10)

    def test_need_network_ranks_actionable_mobility_above_generic_question(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "generic",
                "text": "第一次看演唱會，想問大家覺得值得去嗎？",
                "username": "generic",
                "permalink": "https://www.threads.com/@generic/post/generic",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "mobility",
                "text": "Concert ends at 10:30. Can I catch the last metro, or should I stay near the venue?",
                "username": "traveler",
                "permalink": "https://www.threads.com/@traveler/post/mobility",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        deck = build_deck(posts, now)
        cards = deck["windows"]["1d"]["cards"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["post_id"], "mobility")
        self.assertEqual(cards[0]["language_context"], "english")
        self.assertIn("mobility", cards[0]["need_nodes"])
        self.assertIn("stay", cards[0]["need_nodes"])
        self.assertIn("mobility->venue_outside", cards[0]["need_edges"])
        self.assertEqual(cards[0]["actionability_band"], "high")
        self.assertEqual(cards[0]["candidate_confidence"], "high")

    def test_language_context_is_context_not_a_filter(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "hk",
                "text": "聽日去睇演唱會，散場後港鐵仲有冇車返酒店？",
                "username": "hk",
                "permalink": "https://www.threads.com/@hk/post/hk",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "hans",
                "text": "第一次去看演唱会，散场以后地铁来得及吗？酒店住哪里比较方便？",
                "username": "hans",
                "permalink": "https://www.threads.com/@hans/post/hans",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]
        cards = {card["post_id"]: card for card in build_deck(posts, now)["windows"]["1d"]["cards"]}
        self.assertEqual(cards["hk"]["language_context"], "hk_zh")
        self.assertEqual(cards["hans"]["language_context"], "zh_hans")
        self.assertTrue(cards["hk"]["need_nodes"])
        self.assertTrue(cards["hans"]["need_nodes"])

    def test_generic_fandom_is_kept_but_moved_to_low_actionability(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [{
            "id": "fan-only",
            "text": "演唱會真的太感動了，今天還在回味，下一場一定還要去！",
            "username": "fan",
            "permalink": "https://www.threads.com/@fan/post/fan-only",
            "timestamp": "2026-10-03T01:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
            "relevance_score": 60,
        }]
        window = build_deck(posts, now)["windows"]["1d"]
        self.assertEqual(window["cards"], [])
        self.assertEqual(window["low_confidence_count"], 1)



    def test_third_party_transport_mention_is_demoted_below_real_user_need(self):
        now = datetime(2026, 10, 5, 3, 0, tzinfo=timezone.utc)
        profile = {
            "schema_version": "relevance-profile-v0.3",
            "generated_at": "2026-10-05T00:00:00Z",
            "feedback_count": 247,
            "feature_weights": {"transport_need": 4.2},
            "category_weights": {"交通／散場": 1.473},
        }
        posts = [
            {
                "id": "artist-flight",
                "text": "演唱会结束后他坐红眼航班连夜回韩，公司为了节省成本让成员直接飞回去。",
                "username": "fandom",
                "permalink": "https://www.threads.com/@fandom/post/artist-flight",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 68,
            },
            {
                "id": "real-need",
                "text": "演唱会散场后我怕赶不上高铁末班车，请问要怎么回台北？",
                "username": "traveler",
                "permalink": "https://www.threads.com/@traveler/post/real-need",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 68,
            },
        ]

        window = build_deck(posts, now, profile)["windows"]["1d"]
        cards = window["cards"]
        by_id = {card["post_id"]: card for card in cards}

        self.assertEqual(cards[0]["post_id"], "real-need")
        self.assertEqual(by_id["real-need"]["intent_band"], "high")
        self.assertGreater(by_id["real-need"]["ranking_delta"], 5)
        self.assertNotIn("artist-flight", by_id)
        self.assertEqual(window["low_confidence_count"], 1)

    def test_staffing_post_is_kept_but_heavily_demoted(self):
        now = datetime(2026, 10, 5, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "staffing",
                "text": "JOB DROP Concert crew needed near Bukit Jalil. Hiring ticket checking staff from 2PM to 11PM.",
                "username": "jobs",
                "permalink": "https://www.threads.com/@jobs/post/staffing",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 75,
            },
            {
                "id": "hotel",
                "text": "Concert ends late. I need a hotel near the venue because I cannot catch the last train home.",
                "username": "fan",
                "permalink": "https://www.threads.com/@fan/post/hotel",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 68,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        cards = window["cards"]
        by_id = {card["post_id"]: card for card in cards}

        self.assertEqual(cards[0]["post_id"], "hotel")
        self.assertNotIn("staffing", by_id)
        self.assertEqual(window["low_confidence_count"], 1)


    def test_confidence_gate_keeps_high_samples_medium_and_excludes_low(self):
        now = datetime(2026, 10, 5, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "high",
                "text": "演唱會散場後我怕趕不上高鐵末班車，請問怎麼回台北？",
                "username": "high",
                "permalink": "https://www.threads.com/@high/post/high",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "medium",
                "text": "演唱會捷運怎麼樣？",
                "username": "medium",
                "permalink": "https://www.threads.com/@medium/post/medium",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "low",
                "text": "演唱會真的太感動了，今天還在回味。",
                "username": "low",
                "permalink": "https://www.threads.com/@low/post/low",
                "timestamp": "2026-10-05T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]
        window = build_deck(posts, now)["windows"]["1d"]
        ids = {card["post_id"] for card in window["cards"]}
        self.assertIn("high", ids)
        self.assertIn("medium", ids)
        self.assertNotIn("low", ids)
        self.assertEqual(window["low_confidence_count"], 1)
        self.assertGreaterEqual(window["high_confidence_count"], 1)
        self.assertGreaterEqual(window["medium_confidence_count"], 1)


    def test_target_fit_demotes_generic_concert_questions_but_keeps_operational_needs(self):
        now = datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "recommend",
                "text": "D.O. 的演唱會推薦看嗎？突然想去但不知道演唱會氛圍如何。",
                "username": "recommend",
                "permalink": "https://www.threads.com/@recommend/post/recommend",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
            {
                "id": "lottery",
                "text": "想問田馥甄演唱會是不是選全區抽中率比較高？大家會怎麼選？",
                "username": "lottery",
                "permalink": "https://www.threads.com/@lottery/post/lottery",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
            {
                "id": "recording",
                "text": "請問演唱會用 S26 Ultra 錄影的設定怎麼調？防手震跟對焦要開什麼比較好？",
                "username": "recording",
                "permalink": "https://www.threads.com/@recording/post/recording",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
            {
                "id": "postprocess",
                "text": "為什麼演唱會拍的影片上傳夸克再下載到相冊會變暗？是不是解碼問題？",
                "username": "postprocess",
                "permalink": "https://www.threads.com/@postprocess/post/postprocess",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        self.assertIn("recording", by_id)
        self.assertEqual(by_id["recording"]["candidate_confidence"], "high")
        self.assertIn("live_recording_setup", by_id["recording"]["target_fit_signals"])

        self.assertNotIn("recommend", by_id)
        self.assertNotIn("lottery", by_id)
        self.assertNotIn("postprocess", by_id)
        self.assertGreaterEqual(window["low_confidence_count"], 3)

    def test_target_fit_keeps_core_next_stop_patterns(self):
        now = datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "mobility",
                "text": "有人知道演唱會大概幾點結束嗎？因為要趕高鐵，在想要買幾點的票。",
                "username": "mobility",
                "permalink": "https://www.threads.com/@mobility/post/mobility",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 65,
            },
            {
                "id": "stay",
                "text": "有去曼谷看演唱會的人嗎？想找離 Impact 近的酒店，最好樓下有 711。",
                "username": "stay",
                "permalink": "https://www.threads.com/@stay/post/stay",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 65,
            },
            {
                "id": "solo",
                "text": "我在糾結要不要去香港看演唱會，但一個人去有點尷尬。",
                "username": "solo",
                "permalink": "https://www.threads.com/@solo/post/solo",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 65,
            },
            {
                "id": "ticket-commitment",
                "text": "求一張日本場門票，機票已經買好了但抽選落選，真的不知道下一步怎麼辦。",
                "username": "ticket",
                "permalink": "https://www.threads.com/@ticket/post/ticket",
                "timestamp": "2026-10-06T14:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 65,
            },
        ]

        cards = {card["post_id"]: card for card in build_deck(posts, now)["windows"]["1d"]["cards"]}
        for post_id in ("mobility", "stay", "solo", "ticket-commitment"):
            self.assertIn(post_id, cards)
            self.assertIn(cards[post_id]["candidate_confidence"], {"high", "medium"})
            self.assertGreaterEqual(cards[post_id]["target_fit_score"], 2)


    def test_nearby_word_alone_does_not_create_post_event_fit(self):
        now = datetime(2026, 10, 6, 15, 40, tzinfo=timezone.utc)
        posts = [
            {
                "id": "complaint",
                "text": "看演唱會麻煩有點素質，不想聽也不用講出來讓附近的人都知道。",
                "username": "complaint",
                "permalink": "https://www.threads.com/@complaint/post/complaint",
                "timestamp": "2026-10-06T15:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
            {
                "id": "after-event",
                "text": "演唱會結束後我想去附近的 711 跟朋友集合，再看看有沒有地方吃宵夜。",
                "username": "after",
                "permalink": "https://www.threads.com/@after/post/after",
                "timestamp": "2026-10-06T15:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        self.assertNotIn("complaint", by_id)
        self.assertIn("after-event", by_id)
        self.assertIn("post_event_nearby", by_id["after-event"]["target_fit_signals"])


    def test_discovery_lane_preserves_uncertain_but_meaningful_attendee_friction(self):
        now = datetime(2026, 10, 7, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "id-check",
                "text": "有沒有姐妹知道演唱會內場領手環會不會查證件？我收的票名字對不上，很怕福利不能用。",
                "username": "idcheck",
                "permalink": "https://www.threads.com/@idcheck/post/id-check",
                "timestamp": "2026-10-07T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "generic",
                "text": "這場演唱會值得去嗎？有人推薦嗎？",
                "username": "generic",
                "permalink": "https://www.threads.com/@generic/post/generic",
                "timestamp": "2026-10-07T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        self.assertIn("id-check", by_id)
        self.assertEqual(by_id["id-check"]["review_lane"], "core")
        self.assertIn("venue_operation", by_id["id-check"]["target_fit_signals"])

        self.assertNotIn("generic", by_id)

    def test_discovery_lane_samples_low_confidence_meaningful_signals(self):
        now = datetime(2026, 10, 7, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "wear",
                "text": "這禮拜去看演唱會要穿長袖還是短袖帶外套？我從南部上去不知道怎麼穿。",
                "username": "wear",
                "permalink": "https://www.threads.com/@wear/post/wear",
                "timestamp": "2026-10-07T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "eligibility",
                "text": "這個韓國演唱會外國人能不能報名？還是只能韓國人申請？",
                "username": "elig",
                "permalink": "https://www.threads.com/@elig/post/eligibility",
                "timestamp": "2026-10-07T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        self.assertIn("wear", by_id)
        self.assertIn(by_id["wear"]["review_lane"], {"adjacent", "discovery"})
        self.assertIn("attendee_prep", by_id["wear"]["target_fit_signals"])

        self.assertIn("eligibility", by_id)
        self.assertIn(by_id["eligibility"]["review_lane"], {"core", "discovery"})
        self.assertIn("participation_eligibility", by_id["eligibility"]["target_fit_signals"])


    def test_experience_utility_path_keeps_product_and_setup_needs(self):
        now = datetime(2026, 10, 7, 4, 30, tzinfo=timezone.utc)
        posts = [
            {
                "id": "phone",
                "text": "演唱會錄影用哪支手機比較好？我最在意收音、變焦跟防手震。",
                "username": "phone",
                "permalink": "https://www.threads.com/@phone/post/phone",
                "timestamp": "2026-10-07T04:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "battery",
                "text": "看演唱會錄影超耗電，想問大家會帶多大的行動電源？",
                "username": "battery",
                "permalink": "https://www.threads.com/@battery/post/battery",
                "timestamp": "2026-10-07T04:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        for post_id in ("phone", "battery"):
            self.assertIn(post_id, by_id)
            self.assertEqual(by_id[post_id]["review_lane"], "adjacent")
            self.assertIn("experience_utility", by_id[post_id]["target_fit_paths"])

    def test_media_retrieval_stays_discovery_not_adjacent(self):
        now = datetime(2026, 10, 7, 4, 30, tzinfo=timezone.utc)
        posts = [
            {
                "id": "clip",
                "text": "有人拍到剛剛安可那段影片嗎？求影片！",
                "username": "clip",
                "permalink": "https://www.threads.com/@clip/post/clip",
                "timestamp": "2026-10-07T04:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        window = build_deck(posts, now)["windows"]["1d"]
        by_id = {card["post_id"]: card for card in window["cards"]}

        self.assertIn("clip", by_id)
        self.assertEqual(by_id["clip"]["review_lane"], "discovery")
        self.assertEqual(by_id["clip"]["candidate_confidence"], "low")
        self.assertIn("media_retrieval", by_id["clip"]["target_fit_signals"])

    def test_other_latin_stays_in_raw_data_but_is_excluded_from_review_deck(self):
        now = datetime(2026, 10, 3, 3, 0, tzinfo=timezone.utc)
        posts = [{
            "id": "other-latin",
            "text": "Esok siapa pergi concert wali band live di jb? Korang tema yang mana satu?",
            "username": "other",
            "permalink": "https://www.threads.com/@other/post/other",
            "timestamp": "2026-10-03T02:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
            "relevance_score": 60,
        }]
        deck = build_deck(posts, now)
        self.assertEqual(deck["source_master_count"], 1)
        self.assertEqual(deck["windows"]["1d"]["card_count"], 0)


if __name__ == "__main__":
    unittest.main()
