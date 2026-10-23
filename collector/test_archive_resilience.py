import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))
from archive_resilience import prepare


class ArchiveResilienceTest(unittest.TestCase):
    def test_sync_failure_saves_good_source_and_stale_attempt_keeps_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            output, latest = Path(tmp) / 'output', Path(tmp) / 'latest'
            output.mkdir()
            good = dict(run_stamp='test', run_status='Success', coverage_status='observed',
                        raw_rows=4, filter_diagnostics={'accepted_raw_rows': 2})
            (output / 'summary.json').write_text(json.dumps(good))
            (output / 'observation_bundle.json').write_text('{"run": {}}')
            (output / 'snapshot_test.json').write_text('[{"id":"real"}]')
            self.assertTrue(prepare(output, latest, 'failure'))
            self.assertEqual(json.loads((latest / 'last_good_summary.json').read_text())['notion_sync_status'], 'failure')
            backup = (latest / 'last_good_snapshot.json').read_bytes()
            good.update(coverage_status='stale', run_status='Partial')
            (output / 'summary.json').write_text(json.dumps(good))
            self.assertFalse(prepare(output, latest, 'success'))
            self.assertEqual((latest / 'last_good_snapshot.json').read_bytes(), backup)
            self.assertEqual(json.loads((output / 'observation_bundle.json').read_text())['run']['notion_sync_status'], 'success')

    def test_recent_query_failure_is_bounded_and_recorded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            binary = root / 'th'
            binary.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nexit 5\n')
            binary.chmod(0o755)
            (root / 'queries').write_text('# comment\nconcert\n')
            result = subprocess.run(['bash', str(Path(__file__).with_name('collect.sh').resolve())],
                env={**os.environ, 'TH_BIN': str(binary), 'QUERY_FILE': str(root/'queries'),
                     'RAW_DIR': str(root/'raw'), 'FAILED_FILE': str(root/'failed'),
                     'CALL_LOG': str(root/'calls'), 'SLEEP_SECONDS': '0',
                     'COLLECTOR_SEARCH_TYPE': 'recent'}, capture_output=True)
            self.assertEqual(result.returncode, 0)  # aggregation assesses quality later
            calls = (root/'calls').read_text().splitlines()
            self.assertEqual(len(calls), 1)
            self.assertIn('--retries 1', calls[0])
            self.assertEqual((root/'failed').read_text(), 'concert\n')
