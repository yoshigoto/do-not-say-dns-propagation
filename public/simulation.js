export const TTL = { browserDns: 30, browserHttp: 90, address: 120, delegation: 180 };
export const ADDRESSES = {
  A: { old: '192.0.2.10', new: '192.0.2.20' },
  AAAA: { old: '2001:db8::10', new: '2001:db8::20' }
};

export function createSimulation(scenario = 'address', type = 'A') {
  return {
    scenario, type, time: 0, changed: false,
    browserDns: null, browserHttp: null, resolverAddress: null, resolverDelegation: null,
    result: null,
    events: ['準備完了。まず「サイトにアクセス」を押してキャッシュを作りましょう。'],
    activities: [{ actor: 'シミュレーター', text: '準備完了。まず「サイトにアクセス」を押してキャッシュを作りましょう。' }]
  };
}

function setActivities(state, activities) {
  state.activities = activities;
  state.events = activities.map(activity => activity.text);
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
      : '親ゾーンの NS リソースレコードを変更し、新しい権威サーバーに委任しました。旧委任先をキャッシュしているフルサービスリゾルバーは、その期限が切れるまで旧権威サーバーに問い合わせることがあります。'
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
    }]);
    return;
  }

  let address;
  let cacheReason = 'authoritative';
  const httpMiss = 'HTTP キャッシュは空または期限切れです。';
  if (valid(state.browserDns, state.time)) {
    address = state.browserDns.value;
    cacheReason = 'browser-dns';
    const text = `${httpMiss} DNS キャッシュは有効なので、保存されている ${address} を使います。`;
    activities.push({ actor: 'ブラウザー', text });
  } else {
    const text = `${httpMiss} DNS キャッシュも空または期限切れです。フルサービスリゾルバーに問い合わせます。`;
    activities.push({ actor: 'ブラウザー', text });
    if (valid(state.resolverAddress, state.time)) {
      address = state.resolverAddress.value;
      cacheReason = 'resolver';
      const text = `${state.type} キャッシュが有効です。保存されている ${address} をブラウザーに返しました。`;
      activities.push({ actor: 'フルサービスリゾルバー', text });
    } else {
      let authorityLabel = '権威サーバー';
      let isNew = state.changed;
      const addressMiss = `${state.type} キャッシュは空または期限切れです。`;
      let lookupText;
      if (state.scenario === 'address') {
        lookupText = `${addressMiss} 同じ権威サーバーに ${state.type} を問い合わせます。`;
      } else {
        const cachedDelegation = valid(state.resolverDelegation, state.time);
        const authority = cachedDelegation ? state.resolverDelegation.value : (state.changed ? 'new' : 'old');
        authorityLabel = authority === 'old' ? '旧権威サーバー' : '新権威サーバー';
        isNew = state.changed && authority === 'new';
        if (!cachedDelegation) {
          state.resolverDelegation = { value: authority, expires: state.time + TTL.delegation };
        }
        lookupText = cachedDelegation
          ? `${addressMiss} 委任キャッシュは有効なので、保存されている委任先（${authorityLabel}）に問い合わせます。`
          : `${addressMiss} 委任キャッシュも空または期限切れです。親ゾーンから取得した委任情報を ${TTL.delegation} 秒間キャッシュし、委任先（${authorityLabel}）に問い合わせます。`;
      }
      activities.push({ actor: 'フルサービスリゾルバー', text: lookupText });
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
  setActivities(state, activities);
}
