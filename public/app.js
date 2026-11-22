import { ADDRESSES, TTL, advance, change, clearBrowser, clearHttp, createSimulation, remaining, request } from './simulation.js';

let state = createSimulation();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function cacheLine(entry, label, key) {
  const seconds = remaining(entry, state.time);
  const element = document.createElement('div');
  element.dataset.focusKey = key;
  const value = entry?.value?.page ?? entry?.value;
  element.textContent = `${label}: ${seconds ? `${value} · 残り ${seconds}秒` : 'なし / 期限切れ'}`;
  return element;
}

function renderInspection() {
  const inspection = state.inspection;
  const roleLabels = {
    source: '直接利用',
    result: '結果',
    check: '確認',
    changed: '変更対象',
    unchanged: '変更なし',
    expired: '期限切れ',
    cleared: '消去'
  };
  $('#focus-heading').textContent = inspection.title;
  $('#focus-summary').textContent = inspection.summary;
  $('#focus-steps').replaceChildren(...inspection.steps.map((step, index) => {
    const item = document.createElement('li');
    item.className = `focus-step role-${step.role}`;
    const number = document.createElement('span');
    number.className = 'focus-step-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const label = document.createElement('strong');
    label.textContent = step.label;
    const role = document.createElement('small');
    role.textContent = roleLabels[step.role];
    item.append(number, label, role);
    return item;
  }));
  $$('[data-focus-key]').forEach(element => {
    element.classList.remove('focus-path', 'focus-source');
  });
  inspection.steps.forEach(step => {
    $$(`[data-focus-key="${step.key}"]`).forEach(element => {
      element.classList.add('focus-path');
      if (step.role === 'source' || step.role === 'changed') element.classList.add('focus-source');
    });
  });
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
  $('#clock').dataset.focusKey = 'clock';
  const browserCache = [
    cacheLine(state.browserHttp, 'HTTP', 'browser-http'),
    cacheLine(state.browserDns, '名前解決結果', 'browser-dns')
  ];
  $('[data-browser-cache]').replaceChildren(...browserCache);
  const resolverCache = [cacheLine(state.resolverAddress, state.type, 'resolver-address')];
  if (!isAddress) {
    const delegationText = state.resolverDelegation && remaining(state.resolverDelegation, state.time)
      ? `${state.resolverDelegation.value === 'old' ? '旧' : '新'}権威 · 残り ${remaining(state.resolverDelegation, state.time)}秒`
      : 'なし / 期限切れ';
    const delegation = document.createElement('div');
    delegation.dataset.focusKey = 'resolver-delegation';
    delegation.textContent = `委任先: ${delegationText}`;
    resolverCache.push(delegation);
  }
  $('[data-resolver-cache]').replaceChildren(...resolverCache);
  $('#record-description').textContent = isAddress
    ? ''
    : '変更するのは親ゾーンの NS リソースレコードです。上の A / AAAA は移転時に変更するリソースレコードではなく、旧・新権威サーバーが返す応答の例です。このデモでは委任とグルーレコードを 1 つのキャッシュとして扱い、旧権威サーバーが古い応答を返し続ける場合を示します。';
  renderRecordDisplay(isAddress);
  renderWebPreview();
  renderInspection();
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
  preview.dataset.focusKey = 'page';
  const result = state.result;
  if (!result) {
    preview.dataset.page = 'waiting';
    $('#web-preview-status').textContent = '未アクセス';
    $('#web-preview-page').textContent = 'Waiting...';
    $('#web-preview-address').textContent = 'サイトにアクセスすると表示例が更新されます。';
    $('#web-preview-explanation').textContent = 'まだアクセスしていません。';
    return;
  }

  const isNew = result.address === ADDRESSES[state.type].new;
  preview.dataset.page = isNew ? 'new' : 'old';

  $('#web-preview-status').textContent = result.source === 'HTTP キャッシュ'
    ? 'HTTP キャッシュ'
    : 'Web サーバーから取得';
  $('#web-preview-page').textContent = isNew ? 'New page' : 'Old page';
  $('#web-preview-address').textContent = `${state.type} ${result.address}`;

  if (result.reason === 'http') {
    $('#web-preview-explanation').textContent = 'HTTP キャッシュが有効なので、DNS 問い合わせもせず保存された表示をそのまま見ています。';
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
