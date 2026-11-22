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
  assert.equal(state.activities[2].actor, '旧権威サーバー');
  advance(state, TTL.delegation - TTL.address);
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.old);
  assert.equal(state.activities.some(activity => activity.actor.endsWith('権威サーバー')), false);
  advance(state, TTL.address - (TTL.delegation - TTL.address));
  clearBrowser(state);
  request(state);
  assert.equal(state.result.address, ADDRESSES.A.new);
  assert.deepEqual(state.activities.slice(1, 5).map(({ actor }) => actor), [
    'フルサービスリゾルバー', '親ゾーンの権威サーバー', 'フルサービスリゾルバー', '新権威サーバー'
  ]);
  assert.match(state.activities[2].text, /委任先として新権威サーバーを返しました/);
  assert.match(state.activities[3].text, /委任情報を 180 秒間キャッシュし、新権威サーバーに A を問い合わせます/);
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
  assert.match(state.events[0], /HTTP キャッシュは空または期限切れです。DNS キャッシュは有効/);
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
  const state = createSimulation('delegation');
  request(state);
  assert.ok(state.activities.some(activity =>
    activity.actor === 'ブラウザー' &&
    /DNS キャッシュも空または期限切れです/.test(activity.text) &&
    /フルサービスリゾルバーに問い合わせます/.test(activity.text)
  ));
  clearBrowser(state);
  advance(state, TTL.address);
  clearBrowser(state);
  request(state);
  assert.ok(state.activities.some(activity =>
    activity.actor === 'フルサービスリゾルバー' &&
    /キャッシュは空または期限切れです/.test(activity.text) &&
    /旧権威サーバー）に問い合わせます/.test(activity.text)
  ));
});

test('address change does not mention parent delegation', () => {
  const state = createSimulation('address');
  change(state);
  request(state);
  advance(state, TTL.address);
  clearBrowser(state);
  request(state);

  assert.ok(state.activities.some(activity =>
    activity.actor === 'フルサービスリゾルバー' &&
    /キャッシュは空または期限切れです/.test(activity.text) &&
    /同じ権威サーバーに A を問い合わせます/.test(activity.text)
  ));
  assert.ok(state.activities.every(({ actor, text }) => !/親ゾーン|委任|[旧新]権威サーバー/.test(`${actor} ${text}`)));
});

test('delegation mode pairs address cache status with authority delegation', () => {
  const state = createSimulation('delegation');
  request(state);
  change(state);
  advance(state, TTL.address);
  clearBrowser(state);
  request(state);

  assert.ok(state.activities.some(activity =>
    activity.actor === 'フルサービスリゾルバー' &&
    /キャッシュは空または期限切れです/.test(activity.text) &&
    /委任キャッシュは有効なので/.test(activity.text) &&
    /旧権威サーバー）に問い合わせます/.test(activity.text)
  ));
});

test('authoritative answer identifies the resolver as the requester', () => {
  const state = createSimulation('address');
  request(state);

  assert.ok(state.activities.some(activity =>
    activity.actor === '権威サーバー' &&
    /フルサービスリゾルバーからの問い合わせに応答/.test(activity.text)
  ));
});

test('browser connects and fetches the page after a reset', () => {
  let state = createSimulation();
  state = createSimulation(state.scenario, state.type);
  request(state);

  assert.ok(state.activities.some(activity =>
    activity.actor === 'ブラウザー' &&
    /に接続し/.test(activity.text) &&
    /古いページを取得しました/.test(activity.text)
  ));
  assert.ok(state.activities.every(activity => activity.actor !== 'Web サーバー'));
});

test('DNS answer, forwarding and caching are logged once in order by their actors', () => {
  for (const [scenario, authority] of [['address', '権威サーバー'], ['delegation', '旧権威サーバー']]) {
    const state = createSimulation(scenario);
    request(state);
    const answerIndex = state.activities.findIndex(({ actor }) => actor === authority);
    const [answer, forward, receive] = state.activities.slice(answerIndex);
    assert.equal(answer.actor, authority);
    assert.doesNotMatch(answer.text, /キャッシュ|ブラウザー/);
    assert.equal(forward.actor, 'フルサービスリゾルバー');
    assert.match(forward.text, /応答を .* 秒間キャッシュし、ブラウザーに返しました/);
    assert.equal(receive.actor, 'ブラウザー');
    assert.match(receive.text, /DNS の応答.*を受け取り.*DNS キャッシュに/);
    assert.equal(state.activities.filter(({ text }) => text.includes('ブラウザーに返しました')).length, 1);

    clearBrowser(state);
    request(state);
    assert.deepEqual(state.activities.map(({ actor }) => actor), [
      'ブラウザー', 'フルサービスリゾルバー', 'ブラウザー', 'ブラウザー'
    ]);
    assert.match(state.activities[1].text, /キャッシュが有効です。.*ブラウザーに返しました/);
  }
});

test('inspection identifies the exact cache that answered an access', () => {
  const state = createSimulation();
  request(state);
  assert.equal(state.inspection.steps.filter(({ role }) => role === 'result').length, 2);

  request(state);
  assert.deepEqual(
    state.inspection.steps.filter(({ role }) => role === 'source').map(({ key }) => key),
    ['browser-http']
  );

  clearHttp(state);
  request(state);
  assert.deepEqual(
    state.inspection.steps.filter(({ role }) => role === 'source').map(({ key }) => key),
    ['browser-dns']
  );

  clearBrowser(state);
  request(state);
  assert.deepEqual(
    state.inspection.steps.filter(({ role }) => role === 'source').map(({ key }) => key),
    ['resolver-address']
  );
});

test('inspection marks caches that expire during a time advance', () => {
  const state = createSimulation();
  request(state);
  advance(state, TTL.browserDns);

  assert.equal(
    state.inspection.steps.some(({ key, role }) => key === 'browser-dns' && role === 'expired'),
    true
  );
  assert.equal(
    state.inspection.steps.some(({ key, role }) => key === 'browser-http' && role === 'expired'),
    false
  );
  assert.match(state.inspection.summary, /次に「サイトにアクセス」/);
});

test('change inspection separates the updated record from unchanged caches', () => {
  const state = createSimulation();
  request(state);
  change(state);

  assert.equal(state.inspection.steps[0].key, 'record');
  assert.equal(state.inspection.steps[0].role, 'changed');
  assert.ok(state.inspection.steps
    .filter(({ key }) => key !== 'record')
    .every(({ role }) => role === 'unchanged'));
});
