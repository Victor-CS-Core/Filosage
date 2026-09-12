import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
SPEC=importlib.util.spec_from_file_location('preparation_transport',ROOT/'scripts/run-recovery-runtime-preparation.py')
MODULE=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MODULE)
class SchemaExtractionTests(unittest.TestCase):
 def test_capacity_query_before_schema_does_not_replace_privilege_guard(self):
  source=(ROOT/'scripts/verify-azure-database.ts').read_text()
  source="const result = await client.query(`SELECT ${requiredUnreservedConnections} AS compatible`);\n"+source
  sql=MODULE.schema_guard_sql(source)
  self.assertIn('public.filosage_documents',sql);self.assertIn('pg_has_role',sql);self.assertNotIn('${',sql)
 def test_missing_or_interpolated_schema_guard_fails_closed(self):
  for source in ['', 'const result = await client.query(`SELECT true AS compatible`);', (ROOT/'scripts/verify-azure-database.ts').read_text().replace('PRIMARY KEY (path)','${unsafe}')]:
   with self.assertRaises(RuntimeError):MODULE.schema_guard_sql(source)
if __name__=='__main__':unittest.main()
