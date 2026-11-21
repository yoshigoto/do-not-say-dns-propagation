export const TTL = { browserDns: 30, browserHttp: 90, address: 120, delegation: 180 };
export const ADDRESSES = {
  A: { old: '192.0.2.10', new: '192.0.2.20' },
  AAAA: { old: '2001:db8::10', new: '2001:db8::20' }
};

export function createSimulation(scenario = 'address', type = 'A') {
  return {
    scenario, type, time: 0, changed: false,
    browserDns: null, browserHttp: null, resolverAddress: null, resolverDelegation: null,
    result: null, events: ['準備完了。まず「サイトにアクセス」を押してキャッシュを作りましょう。']
  };
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
  state.events = [state.scenario === 'address'
    ? `権威サーバーの ${state.type} レコードを新しいアドレスに変更しました。既存のキャッシュは書き換わりません。`
    : '親ゾーンの委任先を新しい権威サーバーに変更しました。古い権威サーバーは古い答えを返し続けます。'];
}

export function advance(state, seconds) {
  state.time += seconds;
  state.events = [`シミュレーションの時計を ${seconds} 秒進めました。期限切れのキャッシュは次のアクセス時に更新されます。`];
}

export function clearBrowser(state) {
  state.browserDns = null;
  state.browserHttp = null;
  state.events = ['ブラウザーの DNS キャッシュと HTTP キャッシュを消去しました。リゾルバのキャッシュは残っています。'];
}

export function clearHttp(state) {
  state.browserHttp = null;
  state.events = ['ブラウザーの HTTP キャッシュだけを消去しました。DNS キャッシュは残っています。'];
}

export function request(state) {
  const events = [];
  if (valid(state.browserHttp, state.time)) {
    state.result = { ...state.browserHttp.value, source: 'HTTP キャッシュ', reason: 'http' };
    state.events = ['ブラウザーの HTTP キャッシュが有効なので、DNS 問い合わせもサーバーへの通信も行わず、保存されたページを表示しました。'];
    return;
  }

  let address;
  let cacheReason = 'authoritative';
  if (valid(state.browserDns, state.time)) {
    address = state.browserDns.value;
    cacheReason = 'browser-dns';
    events.push(`ブラウザーの DNS キャッシュから ${address} を使用。`);
  } else {
    events.push('ブラウザーの DNS キャッシュは空または期限切れ。リゾルバに問い合わせます。');
    if (valid(state.resolverAddress, state.time)) {
      address = state.resolverAddress.value;
      cacheReason = 'resolver';
      events.push(`リゾルバの ${state.type} キャッシュから ${address} を返答。`);
    } else {
      events.push(`リゾルバの ${state.type} キャッシュは空または期限切れ。`);
      let authority;
      if (valid(state.resolverDelegation, state.time)) {
        authority = state.resolverDelegation.value;
        events.push(`リゾルバはキャッシュされた委任先（${authority === 'old' ? '旧' : '新'}権威サーバー）を使用。`);
      } else {
        authority = state.scenario === 'delegation' && state.changed ? 'new' : 'old';
        state.resolverDelegation = { value: authority, expires: state.time + TTL.delegation };
        events.push(`親ゾーンの委任先を確認し、${authority === 'old' ? '旧' : '新'}権威サーバーをキャッシュ。`);
      }
      const isNew = state.changed && (state.scenario === 'address' || authority === 'new');
      address = ADDRESSES[state.type][isNew ? 'new' : 'old'];
      state.resolverAddress = { value: address, expires: state.time + TTL.address };
      events.push(`権威サーバーが ${state.type} ${address} を返答。リゾルバに ${TTL.address} 秒保存。`);
    }
    state.browserDns = { value: address, expires: state.time + TTL.browserDns };
    events.push(`ブラウザーに DNS の答えを ${TTL.browserDns} 秒保存。`);
  }
  const page = address === ADDRESSES[state.type].new ? '新しいサーバー' : '古いサーバー';
  state.result = { address, page, source: 'Web サーバー', reason: cacheReason };
  state.browserHttp = { value: { address, page }, expires: state.time + TTL.browserHttp };
  events.push(`${address} に接続し、${page}のページを取得。HTTP キャッシュに ${TTL.browserHttp} 秒保存。`);
  state.events = events;
}
