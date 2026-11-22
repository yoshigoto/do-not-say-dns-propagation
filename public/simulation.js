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
    inspection: {
      title: 'まず「サイトにアクセス」を押してみましょう',
      summary: 'ブラウザーは HTTP キャッシュから順に調べ、必要な場合だけ DNS や権威サーバーへ進みます。',
      steps: [
        { key: 'browser-http', label: 'ブラウザー HTTP', role: 'check' },
        { key: 'browser-dns', label: 'ブラウザー DNS', role: 'check' },
        { key: 'resolver-address', label: 'リゾルバー IP', role: 'check' },
        { key: 'record', label: '権威サーバーの記録', role: 'check' }
      ]
    },
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
  state.inspection = {
    title: '設定が変わった場所を確認しましょう',
    summary: '権威サーバーや親ゾーンの設定だけが変わりました。すでに保存されたキャッシュは自動では書き換わりません。',
    steps: [
      { key: 'record', label: '変更後の設定', role: 'changed' },
      { key: 'browser-http', label: 'ブラウザー HTTP', role: 'unchanged' },
      { key: 'browser-dns', label: 'ブラウザー DNS', role: 'unchanged' },
      { key: 'resolver-address', label: 'リゾルバー IP', role: 'unchanged' },
      ...(state.scenario === 'delegation'
        ? [{ key: 'resolver-delegation', label: 'リゾルバー委任先', role: 'unchanged' }]
        : [])
    ]
  };
  setActivities(state, [{
    actor: 'DNS 管理者',
    text: state.scenario === 'address'
      ? `Web サーバーの IP アドレスの変更に合わせ、権威サーバーの ${state.type} リソースレコードを更新しました。既存のキャッシュは書き換わりません。`
      : '親ゾーンの NS リソースレコードを変更し、新しい権威サーバーに委任しました。旧委任先をキャッシュしているフルサービスリゾルバーは、その期限が切れるまで旧権威サーバーに問い合わせることがあります。'
  }]);
}

export function advance(state, seconds) {
  const previousTime = state.time;
  state.time += seconds;
  const cacheEntries = [
    ['browser-http', 'ブラウザー HTTP', state.browserHttp],
    ['browser-dns', 'ブラウザー DNS', state.browserDns],
    ['resolver-address', 'リゾルバー IP', state.resolverAddress],
    ...(state.scenario === 'delegation'
      ? [['resolver-delegation', 'リゾルバー委任先', state.resolverDelegation]]
      : [])
  ];
  const expired = cacheEntries
    .filter(([, , entry]) => valid(entry, previousTime) && !valid(entry, state.time))
    .map(([key, label]) => ({ key, label, role: 'expired' }));
  state.inspection = {
    title: expired.length ? `${expired.length} 個のキャッシュが期限切れになりました` : '時間が進みましたが、有効な結果は変わりません',
    summary: expired.length
      ? '期限切れのキャッシュは、次に「サイトにアクセス」したときに再取得されます。今回の操作だけでは通信は発生しません。'
      : '現在の有効期限を確認できます。次の「サイトにアクセス」で、どのキャッシュが使われるかが決まります。',
    steps: [
      { key: 'clock', label: `現在 ${state.time} 秒`, role: 'check' },
      ...(expired.length
        ? expired
        : cacheEntries
            .filter(([, , entry]) => entry)
            .map(([key, label, entry]) => ({
              key,
              label: `${label}（残り ${remaining(entry, state.time)} 秒）`,
              role: 'check'
            })))
    ]
  };
  setActivities(state, [{
    actor: '利用者',
    text: `シミュレーションの時計を ${seconds} 秒進めました。期限切れのキャッシュは必要に応じて次のアクセス時に再取得されます。`
  }]);
}

export function clearBrowser(state) {
  state.browserDns = null;
  state.browserHttp = null;
  state.inspection = {
    title: 'ブラウザーのキャッシュだけが消えました',
    summary: '次のアクセスではブラウザーからリゾルバーへ進みます。リゾルバーのキャッシュはそのままなので、そこで止まる可能性があります。',
    steps: [
      { key: 'browser-http', label: 'ブラウザー HTTP', role: 'cleared' },
      { key: 'browser-dns', label: 'ブラウザー DNS', role: 'cleared' },
      { key: 'resolver-address', label: 'リゾルバー IP（変更なし）', role: 'unchanged' },
      ...(state.scenario === 'delegation'
        ? [{ key: 'resolver-delegation', label: 'リゾルバー委任先（変更なし）', role: 'unchanged' }]
        : [])
    ]
  };
  setActivities(state, [{
    actor: '利用者',
    text: 'ブラウザーの DNS キャッシュと HTTP キャッシュを消去しました。フルサービスリゾルバーのキャッシュには影響しません。'
  }]);
}

export function clearHttp(state) {
  state.browserHttp = null;
  state.inspection = {
    title: 'HTTP キャッシュだけが消えました',
    summary: '次のアクセスでは HTTP キャッシュを迂回し、ブラウザーの DNS キャッシュが直接使われるかを確認します。',
    steps: [
      { key: 'browser-http', label: 'ブラウザー HTTP', role: 'cleared' },
      { key: 'browser-dns', label: 'ブラウザー DNS', role: 'check' }
    ]
  };
  setActivities(state, [{
    actor: '利用者',
    text: 'ブラウザーの HTTP キャッシュだけを消去しました。DNS キャッシュには影響しません。'
  }]);
}

export function request(state) {
  const activities = [];
  if (valid(state.browserHttp, state.time)) {
    state.result = { ...state.browserHttp.value, source: 'HTTP キャッシュ', reason: 'http' };
    state.inspection = {
      title: 'HTTP キャッシュだけでページを表示しました',
      summary: 'このアクセスはブラウザーの HTTP キャッシュで終了しました。DNS キャッシュやリゾルバー、権威サーバーは参照されていません。',
      steps: [
        { key: 'browser-http', label: 'ブラウザー HTTP', role: 'source' },
        { key: 'page', label: '表示されたページ', role: 'result' }
      ]
    };
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
    const text = `${httpMiss}DNS キャッシュは有効なので、保存されている ${address} を使います。`;
    activities.push({ actor: 'ブラウザー', text });
  } else {
    const text = `${httpMiss}DNS キャッシュも空または期限切れです。フルサービスリゾルバーに問い合わせます。`;
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
      if (state.scenario === 'address') {
        activities.push({ actor: 'フルサービスリゾルバー', text: `${addressMiss}同じ権威サーバーに ${state.type} を問い合わせます。` });
      } else {
        const cachedDelegation = valid(state.resolverDelegation, state.time);
        const authority = cachedDelegation ? state.resolverDelegation.value : (state.changed ? 'new' : 'old');
        authorityLabel = authority === 'old' ? '旧権威サーバー' : '新権威サーバー';
        isNew = state.changed && authority === 'new';
        if (cachedDelegation) {
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
  if (cacheReason === 'browser-dns') {
    state.inspection = {
      title: 'ブラウザーの DNS キャッシュから IP アドレスを使いました',
      summary: 'HTTP キャッシュはありませんでしたが、ブラウザー DNS キャッシュが有効なので、リゾルバーには問い合わせていません。',
      steps: [
        { key: 'browser-http', label: 'HTTP は空 / 期限切れ', role: 'check' },
        { key: 'browser-dns', label: 'ブラウザー DNS', role: 'source' },
        { key: 'page', label: '接続したページ', role: 'result' }
      ]
    };
  } else if (cacheReason === 'resolver') {
    state.inspection = {
      title: 'リゾルバーの IP アドレスキャッシュから回答しました',
      summary: `ブラウザーの 2 つのキャッシュは使えず、リゾルバーの ${state.type} キャッシュが回答元になりました。権威サーバーへの問い合わせはありません。`,
      steps: [
        { key: 'browser-http', label: 'HTTP は空 / 期限切れ', role: 'check' },
        { key: 'browser-dns', label: 'DNS は空 / 期限切れ', role: 'check' },
        { key: 'resolver-address', label: `リゾルバー ${state.type}`, role: 'source' },
        { key: 'page', label: '接続したページ', role: 'result' }
      ]
    };
  } else {
    const delegationUsed = state.scenario === 'delegation'
      && activities.some(({ text }) => text.includes('委任キャッシュは有効'));
    state.inspection = {
      title: delegationUsed
        ? 'リゾルバーの委任先キャッシュから旧権威サーバーへ問い合わせました'
        : '権威サーバーの現在の記録から回答しました',
      summary: delegationUsed
        ? 'IP アドレスのキャッシュは期限切れでしたが、委任先キャッシュが旧権威サーバーを指したままなので、古い応答を取得しました。'
        : 'ブラウザーとリゾルバーに利用できる回答がなく、権威サーバーから新たに取得しました。',
      steps: [
        { key: 'browser-http', label: 'HTTP は空 / 期限切れ', role: 'check' },
        { key: 'browser-dns', label: 'DNS は空 / 期限切れ', role: 'check' },
        { key: 'resolver-address', label: `リゾルバー ${state.type} は空 / 期限切れ`, role: 'check' },
        ...(state.scenario === 'delegation'
          ? [{ key: 'resolver-delegation', label: 'リゾルバー委任先', role: delegationUsed ? 'source' : 'check' }]
          : []),
        { key: 'record', label: '権威サーバーの回答', role: 'result' },
        { key: 'page', label: '接続したページ', role: 'result' }
      ]
    };
  }
  state.browserHttp = { value: { address, page }, expires: state.time + TTL.browserHttp };
  const text = `Web サーバーの IP アドレス ${address} に接続し、${pageAge}ページを取得しました。このページを HTTP キャッシュに ${TTL.browserHttp} 秒間保存します。`;
  activities.push({ actor: 'ブラウザー', text });
  setActivities(state, activities);
}
