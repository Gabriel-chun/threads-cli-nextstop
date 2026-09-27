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


if __name__ == "__main__":
    unittest.main()
