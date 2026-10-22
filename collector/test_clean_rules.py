import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("build_snapshot.py")
SPEC = importlib.util.spec_from_file_location("build_snapshot", MODULE_PATH)
build_snapshot = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(build_snapshot)

is_ticket_transaction = build_snapshot.is_ticket_transaction


class TicketCleanRulesTest(unittest.TestCase):
    def test_hk_let_fly_is_transaction(self):
        self.assertTrue(
            is_ticket_transaction(
                "🔥【讓飛】BIGBANG香港演唱會 11/13 VIP2連位×2 HKD$2699 有興趣PM"
            )
        )

    def test_hk_release_concert_fly_is_transaction(self):
        self.assertTrue(
            is_ticket_transaction(
                "放兩張MAMAMOO香港演唱會飛 時間10/04 價位$2099×2 可單放 有意PM"
            )
        )

    def test_purchase_record_does_not_override_resale(self):
        self.assertTrue(
            is_ticket_transaction(
                "放 BABYMONSTER 香港演唱會 VIP2299二連 4400HKD 有購票紀錄 可以拆 有意PM"
            )
        )

    def test_hk_ticket_demand_is_preserved(self):
        self.assertFalse(
            is_ticket_transaction("有冇人放飛？公售搶唔到，想收飛去睇演唱會")
        )

    def test_purchase_record_friction_is_preserved(self):
        self.assertFalse(
            is_ticket_transaction("入場時購票紀錄要怎麼出示？本人確認會核對嗎？")
        )

    def test_pia_phone_number_friction_is_preserved(self):
        self.assertFalse(
            is_ticket_transaction("Pia帳號一定要日本門號嗎？海外粉絲公售要怎麼買票？")
        )


class SnapshotFilterDiagnosticsTest(unittest.TestCase):
    def test_rejection_reasons_are_exclusive(self):
        from datetime import datetime, timezone
        since = datetime(2026, 10, 22, 0, 0, tzinfo=timezone.utc)
        check = build_snapshot.snapshot_rejection_reason
        base = {"relevance_score": 60, "timestamp": "2026-10-22T01:00:00Z", "permalink": "https://example.com/post/1"}
        self.assertEqual(check(base, 30, since), "")
        self.assertEqual(check({**base, "relevance_score": 10}, 30, since), "below_min_score")
        self.assertEqual(check({**base, "timestamp": ""}, 30, since), "missing_or_invalid_timestamp")
        self.assertEqual(check({**base, "timestamp": "2026-10-21T23:00:00Z"}, 30, since), "older_than_window")
        self.assertEqual(check({**base, "permalink": "", "id": ""}, 30, since), "missing_post_identifier")


if __name__ == "__main__":
    unittest.main()
