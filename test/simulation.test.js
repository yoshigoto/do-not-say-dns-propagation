import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ADDRESSES, TTL, advance, change, clearBrowser, createSimulation, remaining, request } from '../public/simulation.js';

test('address change keeps old cached answers until they expire for A and AAAA', () => {
  for (const type of ['A', 'AAAA']) {
    const state = createSimulation('address', type);
    request(state);
    change(state);
    request(state);
    assert.equal(state.result.source, 'HTTP キャッシュ');
    clearBrowser(state);
    request(state);
    assert.equal(state.result.address, ADDRESSES[type].old);
    advance(state, TTL.address);
    clearBrowser(state);
    request(state);
    assert.equal(state.result.address, ADDRESSES[type].new);
  }
});

test('cached delegation can fetch an old answer even after the address TTL expires', () => {
  const state = createSimulation('delegation');
  request(state);
  change(state);
  advance(state, TTL.address);
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.old);
  assert.equal(remaining(state.resolverDelegation, state.time), TTL.delegation - TTL.address);
  advance(state, TTL.delegation - TTL.address);
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.old);
  advance(state, TTL.address - (TTL.delegation - TTL.address));
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.new);
});

test('browser DNS cache and HTTP cache are independent of resolver cache', () => {
  const state = createSimulation();
  request(state);
  change(state);
  advance(state, TTL.browserHttp);
  request(state);
  assert.equal(state.result.source, 'Web サーバー');
  assert.equal(state.result.address, ADDRESSES.A.old);
  assert.equal(remaining(state.browserDns, state.time), TTL.browserDns);
  assert.equal(remaining(state.resolverAddress, state.time), TTL.address - TTL.browserHttp);
  advance(state, TTL.browserDns);
  request(state);
  assert.equal(state.result.source, 'HTTP キャッシュ');
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.new);
});
