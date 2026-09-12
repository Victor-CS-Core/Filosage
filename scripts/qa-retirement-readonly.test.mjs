import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import inventory from './qa-retirement-readonly.cjs';
const { connectionConfig } = inventory;
const sha = 'c7d9c2c274bfcaee805332a83d94a208af32f09e';
const base = 'postgresql://filosageqa_runtime:testfixture%21local@filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com/filosageqa?sslmode=verify-full'; // secret-scan: allow-test-fixture

test('validated connection parameters retain exact target, TLS and read-only defaults without connecting', () => {
  const config = connectionConfig(base, sha);
  assert.equal(Object.hasOwn(config, 'connectionString'), false);
  const actual = new pg.Client(config).connectionParameters;
  assert.equal(actual.host, 'filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com');
  assert.equal(actual.port, 5432);
  assert.equal(actual.database, 'filosageqa');
  assert.equal(actual.user, 'filosageqa_runtime');
  assert.equal(actual.password, 'testfixture!local');
  assert.equal(actual.ssl.rejectUnauthorized, true);
  assert.equal(actual.options, '-c default_transaction_read_only=on');
});

test('query overrides are rejected before any connection object is constructed', () => {
  for (const query of ['host=other.example', 'port=6543', 'user=other_role', 'password=other',
    'ssl=0', 'sslmode=disable', 'sslcert=/tmp/file', 'sslkey=/tmp/file', 'sslrootcert=/tmp/file',
    'options=-c%20default_transaction_read_only%3Doff', 'connect_timeout=0']) {
    assert.throws(() => connectionConfig(`${base}&${query}`, sha));
  }
});

test('wrong server, database, role, protocol, port, source and TLS mode fail closed', () => {
  for (const target of [base.replace('postgresql:', 'https:'), base.replace('/filosageqa?', '/filosage?'),
    base.replace('filosageqa_runtime:', 'filosageadmin:'), base.replace('filosagestg-p4ujucgnxq3gs-pg.', 'other.'),
    base.replace('.com/filosageqa', '.com:6543/filosageqa'), base.replace('verify-full', 'disable'), `${base}#fragment`]) {
    assert.throws(() => connectionConfig(target, sha));
  }
  assert.throws(() => connectionConfig(base, '0'.repeat(40)));
});
