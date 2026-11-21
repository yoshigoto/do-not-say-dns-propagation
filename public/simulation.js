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
      : '親ゾーンの NS リソースレコードを変更し、新しい権威サーバーに委任しました。委任情報をキャッシュしているフルサービスリゾルバーは、期限が切れるまで旧サーバーを使うことがあります。'
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
    text: 'ブラウザーの DNS キャッシュと HTTP キャッシュを消去しました。フルサービスリゾルバーのキャッシュは残っています。'
  }]);
}

export function clearHttp(state) {
  state.browserHttp = null;
  setActivities(state, [{
    actor: '利用者',
    text: 'ブラウザーの HTTP キャッシュだけを消去しました。DNS キャッシュは残っています。'
  }]);
}

export function request(state) {
  const events = [];
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
  if (valid(state.browserDns, state.time)) {
    address = state.browserDns.value;
    cacheReason = 'browser-dns';
    const text = `ブラウザーの DNS キャッシュが有効です。ブラウザーの DNS キャッシュから ${address} を使用しました。`;
    events.push(text);
    activities.push({ actor: 'ブラウザー', text });
  } else {
    const text = 'DNS キャッシュは空または期限切れです。フルサービスリゾルバーに問い合わせます。';
    events.push(text);
    activities.push({ actor: 'ブラウザー', text });
    if (valid(state.resolverAddress, state.time)) {
      address = state.resolverAddress.value;
      cacheReason = 'resolver';
      const text = `${state.type} キャッシュが有効です。キャッシュされた ${address} をブラウザーに応答しました。`;
      events.push(text);
      activities.push({ actor: 'フルサービスリゾルバー', text });
    } else {
      let authority;
      if (valid(state.resolverDelegation, state.time)) {
        authority = state.resolverDelegation.value;
        const text = `${state.type} キャッシュは空または期限切れです。委任情報は有効なので、キャッシュされた${authority === 'old' ? '旧' : '新'}権威サーバーに問い合わせます。`;
        events.push(text);
        activities.push({ actor: 'フルサービスリゾルバー', text });
      } else {
        authority = state.scenario === 'delegation' && state.changed ? 'new' : 'old';
        state.resolverDelegation = { value: authority, expires: state.time + TTL.delegation };
        const text = `${state.type} キャッシュと委任情報は空または期限切れです。親ゾーンの委任先を確認し、${authority === 'old' ? '旧' : '新'}権威サーバーをキャッシュして問い合わせます。`;
        events.push(text);
        activities.push({ actor: 'フルサービスリゾルバー', text });
      }
      const isNew = state.changed && (state.scenario === 'address' || authority === 'new');
      address = ADDRESSES[state.type][isNew ? 'new' : 'old'];
      state.resolverAddress = { value: address, expires: state.time + TTL.address };
      const text = `${authority === 'old' ? '旧' : '新'}権威サーバーからの問い合わせに対し、${state.type} ${address} を応答しました。フルサービスリゾルバーは ${TTL.address} 秒保存します。`;
      events.push(text);
      activities.push({ actor: '権威サーバー', text });
    }
    state.browserDns = { value: address, expires: state.time + TTL.browserDns };
    const browserCacheText = `DNS の応答 ${address} をブラウザーに返し、ブラウザーは ${TTL.browserDns} 秒保存します。`;
    events.push(browserCacheText);
    activities.push({ actor: 'ブラウザー', text: browserCacheText });
  }
  const page = address === ADDRESSES[state.type].new ? '新しいサーバー' : '古いサーバー';
  state.result = { address, page, source: 'Web サーバー', reason: cacheReason };
  state.browserHttp = { value: { address, page }, expires: state.time + TTL.browserHttp };
  const text = `${address} に接続し、${page}のページを取得しました。ブラウザーは HTTP キャッシュに ${TTL.browserHttp} 秒保存します。`;
  events.push(text);
  activities.push({ actor: 'Web サーバー', text });
  setActivities(state, activities);
}
