const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTransactionTopology } = require('../src/config/database');

function connectionWithHello(helloResponse) {
  return {
    connection: {
      db: { admin: () => ({ command: async () => helloResponse }) },
    },
  };
}

test('production rejects standalone MongoDB because invitation redemption requires transactions', async () => {
  await assert.rejects(
    assertTransactionTopology(connectionWithHello({}), { NODE_ENV: 'production' }),
    /transactions require a replica set or sharded cluster/i,
  );
});

test('production accepts replica sets and sharded clusters while development permits standalone MongoDB', async () => {
  await assert.doesNotReject(assertTransactionTopology(connectionWithHello({ setName: 'rs0' }), { NODE_ENV: 'production' }));
  await assert.doesNotReject(assertTransactionTopology(connectionWithHello({ msg: 'isdbgrid' }), { NODE_ENV: 'production' }));
  await assert.doesNotReject(assertTransactionTopology(connectionWithHello({}), { NODE_ENV: 'development' }));
});
