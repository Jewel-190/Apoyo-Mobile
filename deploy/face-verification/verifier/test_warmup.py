import unittest

from warmup import WARMUP_ROUNDS, compreface_warmup_succeeded


class WarmupRulesTest(unittest.TestCase):
    def test_completed_compare_counts_as_warm(self):
        self.assertTrue(compreface_warmup_succeeded(None))
        self.assertTrue(compreface_warmup_succeeded("NO_FACE"))

    def test_timeout_does_not_count_as_warm(self):
        self.assertFalse(compreface_warmup_succeeded("COMPREFACE_TIMEOUT"))
        self.assertFalse(compreface_warmup_succeeded("COMPREFACE_ERROR"))
        self.assertFalse(
            compreface_warmup_succeeded("COMPREFACE_API_KEY not configured")
        )

    def test_warmup_hits_both_uwsgi_workers(self):
        self.assertGreaterEqual(WARMUP_ROUNDS, 2)


if __name__ == "__main__":
    unittest.main()
