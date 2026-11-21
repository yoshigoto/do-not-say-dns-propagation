import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ADDRESSES, TTL, advance, change, clearBrowser, clearHttp, createSimulation, remaining, request } from '../public/simulation.js';

test('address change keeps old cached answers until they expire for A and AAAA', () => {
  for (const type of ['A', 'AAAA']) {
    const state = createSimulation('address', type);
    request(state);
    change(state);
    request(state);
    assert.equal(state.result.source, 'HTTP キャッシュ');
    assert.equal(state.result.reason, 'http');
    clearBrowser(state);
    request(state);
    assert.equal(state.result.address, ADDRESSES[type].old);
    assert.equal(state.result.reason, 'resolver');
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

test('clearing only HTTP cache exposes a browser DNS cache hit', () => {
  const state = createSimulation();
  request(state);
  change(state);
  clearHttp(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.old);
  assert.match(state.events[0], /ブラウザーの DNS キャッシュから/);
  assert.equal(remaining(state.resolverAddress, state.time), TTL.address);
});

test('activity records include the actor that performed each operation', () => {
  const state = createSimulation();
  request(state);
  assert.equal(state.activities[0].actor, 'ブラウザー');
  change(state);
  assert.equal(state.activities[0].actor, 'DNS 管理者');
  clearBrowser(state);
  assert.equal(state.activities[0].actor, '利用者');
});

test('cache status and its corresponding action are in the same activity', () => {
  const state = createSimulation();
  request(state);
  assert.ok(state.activities.some(activity =>
    activity.actor === 'ブラウザー' &&
    /DNS キャッシュは空または期限切れです/.test(activity.text) &&
    /フルサービスリゾルバーに問い合わせます/.test(activity.text)
  ));
  clearBrowser(state);
  advance(state, TTL.address);
  clearBrowser(state);
  request(state);
  assert.ok(state.activities.some(activity =>
    activity.actor === 'フルサービスリゾルバー' &&
    /キャッシュは空または期限切れです/.test(activity.text) &&
    /権威サーバーに問い合わせます/.test(activity.text)
  ));
});
