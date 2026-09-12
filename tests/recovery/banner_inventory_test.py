import importlib.util
from pathlib import Path
import hashlib
import hmac
import json
import unittest
spec = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[2] / 'scripts/compare-recovery-banner-inventory.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class InventoryTests(unittest.TestCase):
    def test_membership_length_and_privacy(self):
        key = 'a' * 64; name = 'course-banners/' + 'b' * 32 + '.webp'
        digest = hmac.new(key.encode(), json.dumps([name, 42], separators=(',', ':')).encode(), hashlib.sha256).hexdigest()
        refs = {'blobTupleHmacs': [digest], 'blobReferences': 1, 'invalidReferences': 0, 'inlineReferences': 0}
        result = m.compare(key, refs, [{'name': name, 'properties': {'contentLength': 42}}])
        self.assertTrue(result['blobMembershipVerified']); self.assertNotIn(name, json.dumps(result))
        self.assertFalse(m.compare(key, refs, [{'name': name, 'properties': {'contentLength': 43}}])['blobMembershipVerified'])
        with self.assertRaises(RuntimeError): m.compare(key, refs, [{'name': 'arbitrary', 'properties': {'contentLength': 42}}])
        with self.assertRaises(RuntimeError): m.compare(key, refs, [{}] * 101)
if __name__ == '__main__': unittest.main()
