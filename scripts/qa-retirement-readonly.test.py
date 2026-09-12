"""Offline output-containment checks; no provider, credential or database calls."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('qa-retirement-readonly.py'))
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class OutputContainment(unittest.TestCase):
    def setUp(self):
        self.value = {
            'ok': True,
            'identity': {'correct_database': True, 'correct_role': True, 'read_only': True},
            'roles': [], 'databases': [], 'dependencies': [], 'memberships': [], 'sessions': [], 'relation': [],
            'counts': [{'category': 'courses', 'count': 2}],
            'summary': {'total_documents': 2, 'retained_policy_category_documents': 0,
                'documents_with_account_relation': 0, 'documents_with_course_relation': 0,
                'documents_with_billing_relation': 0, 'public_course_documents': 0,
                'account_deletion_job_documents': 0, 'banner_reference_documents': 0,
                'earliest_created_at': '2026-09-12 00:00:00+00', 'latest_updated_at': None},
        }

    def test_accepts_only_aggregate_shape(self):
        self.assertEqual(inventory.validate_result(self.value), self.value)

    def test_rejects_extra_private_field(self):
        self.value['lessonBody'] = 'synthetic forbidden payload'
        with self.assertRaises(ValueError): inventory.validate_result(self.value)

    def test_rejects_unreviewed_category(self):
        self.value['counts'][0]['category'] = 'synthetic-personal-identifier'
        with self.assertRaises(ValueError): inventory.validate_result(self.value)

    def test_rejects_writable_transaction(self):
        self.value['identity']['read_only'] = False
        with self.assertRaises(ValueError): inventory.validate_result(self.value)

    def test_rejects_raw_provider_error(self):
        with self.assertRaises(ValueError): inventory.validate_result({'ok':False,'stage':'connect','sqlstate':'raw connection string'})

    def test_rejects_mismatched_totals(self):
        self.value['summary']['total_documents'] = 3
        with self.assertRaises(ValueError): inventory.validate_result(self.value)


if __name__ == '__main__': unittest.main()
