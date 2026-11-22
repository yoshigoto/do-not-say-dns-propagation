export const TTL = { browserDns: 30, browserHttp: 90, address: 120, delegation: 180, negative: 120 };
export const ADDRESSES = {
  A: { old: '192.0.2.10', new: '192.0.2.20' },
  AAAA: { old: '2001:db8::10', new: '2001:db8::20' }
};

export function createSimulation(scenario = 'address', type = 'A') {
  return {
    scenario, type, time: 0, changed: false,
    browserDns: null, browserHttp: null, resolverAddress: null, resolverDelegation: null, resolverNegative: null,
    result: null, cacheUsed: null,
    events: ['準備完了。まず「サイトにアクセス」を押してキャッシュを作りましょう。'],
    activities: [{ actor: 'シミュレーター', text: '準備完了。まず「サイトにアクセス」を押してキャッシュを作りましょう。' }]
  };
}

function setActivities(state, activities, cacheUsed = null) {
  state.activities = activities;
  state.events = activities.map(activity => activity.text);
  state.cacheUsed = cacheUsed;
}

function valid(entry, time) {
  return entry && entry.expires > time;
}

export function remaining(entry, time) {
  return entry ? Math.max(0, entry.expires - time) : 0;
}

export function change(state) {
  if (state.changed) return;
  state.changed = true;
  setActivities(state, [{
    actor: 'DNS 管理者',
    text: state.scenario === 'address'
      ? `Web サーバーの IP アドレスの変更に合わせ、権威サーバーの ${state.type} リソースレコードを更新しました。既存のキャッシュは書き換わりません。`
      : state.scenario === 'delegation'
        ? '親ゾーンの NS リソースレコードを変更し、新しい権威サーバーに委任しました。旧委任先をキャッシュしているフルサービスリゾルバーは、その期限が切れるまで旧権威サーバーに問い合わせることがあります。'
        : `権威サーバーに ${state.type} リソースレコードを追加しました。すでに保存されたネガティブキャッシュは書き換わりません。`
  }]);
}

export function advance(state, seconds) {
  state.time += seconds;
  setActivities(state, [{
    actor: '利用者',
    text: `シミュレーションの時計を ${seconds} 秒進めました。期限切れのキャッシュは必要に応じて次のアクセス時に再取得されます。`
  }]);
}

export function clearBrowser(state) {
  state.browserDns = null;
  state.browserHttp = null;
  setActivities(state, [{
    actor: '利用者',
    text: 'ブラウザーの DNS キャッシュと HTTP キャッシュを消去しました。フルサービスリゾルバーのキャッシュには影響しません。'
  }]);
}

export function clearHttp(state) {
  state.browserHttp = null;
  setActivities(state, [{
    actor: '利用者',
    text: 'ブラウザーの HTTP キャッシュだけを消去しました。DNS キャッシュには影響しません。'
  }]);
}

export function request(state) {
  const activities = [];
  if (valid(state.browserHttp, state.time)) {
    state.result = { ...state.browserHttp.value, source: 'HTTP キャッシュ', reason: 'http' };
    setActivities(state, [{
      actor: 'ブラウザー',
      text: 'HTTP キャッシュが有効です。DNS 問い合わせやサーバーへの通信をせず、保存されたページを表示しました。'
    }], 'browser-http');
    return;
  }

  if (state.scenario === 'negative') {
    activities.push({ actor: 'ブラウザー', text: 'HTTP キャッシュは空または期限切れです。名前解決のためフルサービスリゾルバーに問い合わせます。' });
    if (valid(state.resolverNegative, state.time)) {
      state.result = { notFound: true, source: 'フルサービスリゾルバー', reason: 'negative-cache' };
      activities.push({ actor: 'フルサービスリゾルバー', text: `ネガティブキャッシュが有効です。保存されている「ドメイン名が存在しない（NXDOMAIN）」という応答をブラウザーに返しました。残り ${remaining(state.resolverNegative, state.time)} 秒です。` });
      setActivities(state, activities, 'resolver-negative');
      return;
    }

    if (!state.changed) {
      activities.push({ actor: 'フルサービスリゾルバー', text: 'ネガティブキャッシュは空または期限切れです。権威サーバーに問い合わせます。' });
      activities.push({ actor: '権威サーバー', text: '問い合わせられたドメイン名は存在しません。NXDOMAIN と SOA 情報を返しました。' });
      state.resolverNegative = { value: 'NXDOMAIN', expires: state.time + TTL.negative };
      activities.push({ actor: 'フルサービスリゾルバー', text: `NXDOMAIN 応答をネガティブキャッシュに ${TTL.negative} 秒間保存し、ブラウザーに返しました。` });
      state.result = { notFound: true, source: '権威サーバー', reason: 'authoritative-nxdomain' };
      setActivities(state, activities);
      return;
    }

    state.resolverNegative = null;
  }

  let address;
  let cacheReason = 'authoritative';
  let cacheUsed = null;
  const httpMiss = 'HTTP キャッシュは空または期限切れです。';
  if (valid(state.browserDns, state.time)) {
    address = state.browserDns.value;
    cacheReason = 'browser-dns';
    cacheUsed = 'browser-dns';
    const text = `${httpMiss}DNS キャッシュは有効なので、保存されている ${address} を使います。`;
    activities.push({ actor: 'ブラウザー', text });
  } else {
    const text = `${httpMiss}DNS キャッシュも空または期限切れです。フルサービスリゾルバーに問い合わせます。`;
    activities.push({ actor: 'ブラウザー', text });
    if (valid(state.resolverAddress, state.time)) {
      address = state.resolverAddress.value;
      cacheReason = 'resolver';
      cacheUsed = 'resolver-address';
      const text = `${state.type} キャッシュが有効です。保存されている ${address} をブラウザーに返しました。`;
      activities.push({ actor: 'フルサービスリゾルバー', text });
    } else {
      let authorityLabel = '権威サーバー';
      let isNew = state.changed;
      const addressMiss = `${state.type} キャッシュは空または期限切れです。`;
      if (state.scenario !== 'delegation') {
        activities.push({ actor: 'フルサービスリゾルバー', text: `${addressMiss}同じ権威サーバーに ${state.type} を問い合わせます。` });
      } else {
        const cachedDelegation = valid(state.resolverDelegation, state.time);
        const authority = cachedDelegation ? state.resolverDelegation.value : (state.changed ? 'new' : 'old');
        authorityLabel = authority === 'old' ? '旧権威サーバー' : '新権威サーバー';
        isNew = state.changed && authority === 'new';
        if (cachedDelegation) {
          cacheUsed = 'resolver-delegation';
          activities.push({ actor: 'フルサービスリゾルバー', text: `${addressMiss}委任キャッシュは有効なので、保存されている委任先（${authorityLabel}）に問い合わせます。` });
        } else {
          state.resolverDelegation = { value: authority, expires: state.time + TTL.delegation };
          activities.push({ actor: 'フルサービスリゾルバー', text: `${addressMiss}委任キャッシュも空または期限切れです。親ゾーンの権威サーバーに委任先を問い合わせます。` });
          activities.push({ actor: '親ゾーンの権威サーバー', text: `フルサービスリゾルバーからの問い合わせに応答し、委任先として${authorityLabel}を返しました。` });
          activities.push({ actor: 'フルサービスリゾルバー', text: `受け取った委任情報を ${TTL.delegation} 秒間キャッシュし、${authorityLabel}に ${state.type} を問い合わせます。` });
        }
      }
      address = ADDRESSES[state.type][isNew ? 'new' : 'old'];
      activities.push({ actor: authorityLabel, text: `フルサービスリゾルバーからの問い合わせに応答し、${state.type} ${address} を返しました。` });
      state.resolverAddress = { value: address, expires: state.time + TTL.address };
      activities.push({ actor: 'フルサービスリゾルバー', text: `受け取った応答を ${TTL.address} 秒間キャッシュし、ブラウザーに返しました。` });
    }
    state.browserDns = { value: address, expires: state.time + TTL.browserDns };
    const browserCacheText = `DNS の応答 ${address} を受け取り、この情報をブラウザーの DNS キャッシュに ${TTL.browserDns} 秒間保存します。`;
    activities.push({ actor: 'ブラウザー', text: browserCacheText });
  }
  const pageAge = address === ADDRESSES[state.type].new ? '新しい' : '古い';
  const page = `${pageAge}サーバー`;
  state.result = { address, page, source: 'Web サーバー', reason: cacheReason };
  state.browserHttp = { value: { address, page }, expires: state.time + TTL.browserHttp };
  const text = `Web サーバーの IP アドレス ${address} に接続し、${pageAge}ページを取得しました。このページを HTTP キャッシュに ${TTL.browserHttp} 秒間保存します。`;
  activities.push({ actor: 'ブラウザー', text });
  setActivities(state, activities, cacheUsed);
}
