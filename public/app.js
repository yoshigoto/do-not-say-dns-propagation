import { ADDRESSES, TTL, advance, change, clearBrowser, clearHttp, createSimulation, remaining, request } from './simulation.js';

let state = createSimulation();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function cacheRow(text, key) {
  const element = document.createElement('div');
  element.textContent = text;
  if (state.cacheUsed === key) {
    element.className = 'cache-used';
    const badge = document.createElement('span');
    badge.className = 'cache-used-badge';
    badge.textContent = key === 'resolver-delegation' ? '問い合わせ先の決定に使用' : '今回の表示に使用';
    element.append(' ', badge);
  }
  return element;
}

function cacheLine(entry, label, key, formatValue = value => value) {
  const seconds = remaining(entry, state.time);
  const status = seconds ? `${formatValue(entry.value)} · 残り ${seconds}秒` : (entry ? '期限切れ' : 'なし');
  return cacheRow(`${label}: ${status}`, key);
}

function render() {
  const isAddress = state.scenario === 'address';
  $('#scenario-title').textContent = isAddress ? 'Web サーバーの IP アドレスの変更' : '権威サーバーの移転';
  $('#scenario-description').textContent = isAddress
    ? 'Web サーバーの IP アドレスを変更し、同じ権威サーバー上の A / AAAA リソースレコードを更新します。'
    : '親ゾーンの NS リソースレコードを変更します。この例では旧権威サーバーが古い応答、新権威サーバーが新しい応答を返します。';
  $('#resolver-description').textContent = isAddress
    ? '名前解決結果をキャッシュ'
    : '名前解決結果と委任情報をキャッシュ';
  $('#record-heading').innerHTML = isAddress
    ? '権威サーバーの <span>A/AAAA</span> リソースレコード'
    : '親ゾーンの委任先と <span>A/AAAA</span> の応答例';
  $('#clock').textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(state.time % 60).padStart(2, '0')}`;
  const browserCache = [
    cacheLine(state.browserHttp, 'HTTP', 'browser-http', value => value.page),
    cacheLine(state.browserDns, '名前解決結果', 'browser-dns')
  ];
  $('[data-browser-cache]').replaceChildren(...browserCache);
  const resolverCache = [cacheLine(state.resolverAddress, state.type, 'resolver-address')];
  if (!isAddress) {
    resolverCache.push(cacheLine(state.resolverDelegation, '委任先', 'resolver-delegation', value => value === 'old' ? '旧権威' : '新権威'));
  }
  $('[data-resolver-cache]').replaceChildren(...resolverCache);
  $('#record-description').textContent = isAddress
    ? ''
    : '変更するのは親ゾーンの NS リソースレコードです。上の A / AAAA は移転時に変更するリソースレコードではなく、旧・新権威サーバーが返す応答の例です。このデモでは委任とグルーレコードを 1 つのキャッシュとして扱い、旧権威サーバーが古い応答を返し続ける場合を示します。';
  renderRecordDisplay(isAddress);
  renderWebPreview();
  $('#change').disabled = state.changed;
  $('#change span').textContent = state.changed ? '変更済み' : '設定を変更する';
  $$('#events li').forEach(item => item.remove());
  const activities = state.activities || state.events.map(text => ({ actor: 'シミュレーター', text }));
  activities.forEach((activity, index) => {
    const item = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'event-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const actor = document.createElement('span');
    actor.className = 'event-actor';
    actor.textContent = activity.actor;
    const content = document.createElement('div');
    content.className = 'event-content';
    const text = document.createElement('p');
    text.textContent = activity.text;
    content.append(text);
    item.append(number, actor, content);
    $('#events').append(item);
  });
  $$('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario)));
  $$('[data-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.type === state.type)));
}

function renderWebPreview() {
  const preview = $('#web-preview');
  const result = state.result;
  const isNew = result?.address === ADDRESSES[state.type].new;
  const page = result ? (isNew ? 'new' : 'old') : 'waiting';
  preview.classList.toggle('focus-path', page !== 'waiting' && page !== preview.dataset.page);
  preview.dataset.page = page;

  if (!result) {
    $('#web-preview-status').textContent = '未アクセス';
    $('#web-preview-page').textContent = 'Waiting...';
    $('#web-preview-address').textContent = 'サイトにアクセスすると表示例が更新されます。';
    $('#web-preview-explanation').textContent = 'まだアクセスしていません。';
    return;
  }

  $('#web-preview-status').textContent = result.source === 'HTTP キャッシュ'
    ? 'HTTP キャッシュ'
    : 'Web サーバーから取得';
  const pageLabel = isNew ? 'New page' : 'Old page';
  $('#web-preview-page').textContent = pageLabel;
  $('#web-preview-address').textContent = `${state.type} ${result.address}`;

  if (result.reason === 'http') {
    $('#web-preview-explanation').textContent = `前回のアクセスでは、HTTP キャッシュに残っていた ${pageLabel} を表示しました。名前解決結果の有効期限に関係なく、DNS への問い合わせは行いません。`;
  } else if (result.reason === 'browser-dns') {
    $('#web-preview-explanation').textContent = isNew
      ? 'ブラウザーの DNS キャッシュに新しい IP アドレスがあるため、新しい表示になっています。'
      : 'ブラウザーの DNS キャッシュに古い IP アドレスがあるため、古い表示のままです。';
  } else if (result.reason === 'resolver') {
    $('#web-preview-explanation').textContent = isNew
      ? 'フルサービスリゾルバーのキャッシュに新しい IP アドレスがあるため、新しい表示になっています。'
      : 'フルサービスリゾルバーのキャッシュに古い IP アドレスが残っているため、古い表示のままです。';
  } else if (isNew) {
    $('#web-preview-explanation').textContent = '権威サーバーから新しい IP アドレスの応答を取得しました。';
  } else {
    $('#web-preview-explanation').textContent = '権威サーバーから古い IP アドレスの応答を取得しました。';
  }
}

function line(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element;
}

function renderRecordDisplay(isAddress) {
  const values = ['A', 'AAAA'].flatMap(type => {
    if (!isAddress) {
      return [
        [type, ADDRESSES[type].old, '旧権威', state.changed],
        [type, ADDRESSES[type].new, '新権威', !state.changed]
      ];
    }
    const isNew = state.changed && type === state.type;
    return [[type, ADDRESSES[type][isNew ? 'new' : 'old'], isNew ? '変更後' : '現在', false]];
  });
  const delegation = isAddress
    ? []
    : [line(`親ゾーンの現在の委任先: ${state.changed ? '新' : '旧'}権威`)];
  $('#record-display').replaceChildren(...delegation, ...values.map(([type, address, status, inactive]) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const typeLabel = document.createElement('strong');
    typeLabel.textContent = type;
    const addressLabel = document.createElement('span');
    addressLabel.textContent = `${address} (TTL ${TTL.address}秒)`;
    if (inactive) addressLabel.className = 'record-address-inactive';
    const statusLabel = document.createElement('small');
    statusLabel.textContent = status;
    row.append(typeLabel, addressLabel, statusLabel);
    return row;
  }));
}

function setScenarioOptionsVisible(visible) {
  $('#scenario-options').hidden = !visible;
  $('#scenario-toggle').setAttribute('aria-expanded', String(visible));
  $('#scenario-toggle').innerHTML = visible ? '選択内容を隠す <span>↑</span>' : '選択内容を再表示 <span>↓</span>';
}

$('#scenario-toggle').addEventListener('click', () => {
  setScenarioOptionsVisible($('#scenario-options').hidden);
});
$('#request').addEventListener('click', () => { request(state); render(); });
$('#change').addEventListener('click', () => { change(state); render(); });
$('#clear').addEventListener('click', () => { clearBrowser(state); render(); });
$('#clear-http').addEventListener('click', () => { clearHttp(state); render(); });
$('#reset').addEventListener('click', () => { state = createSimulation(state.scenario, state.type); render(); });
$$('[data-advance]').forEach(button => button.addEventListener('click', () => { advance(state, Number(button.dataset.advance)); render(); }));
$$('[data-scenario]').forEach(button => button.addEventListener('click', () => {
  state = createSimulation(button.dataset.scenario, state.type);
  render();
  setScenarioOptionsVisible(false);
}));
$$('[data-type]').forEach(button => button.addEventListener('click', () => {
  state = createSimulation(state.scenario, button.dataset.type);
  render();
  setScenarioOptionsVisible(false);
}));
render();
