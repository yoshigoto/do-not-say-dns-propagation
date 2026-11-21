import { ADDRESSES, TTL, advance, change, clearBrowser, clearHttp, createSimulation, remaining, request } from './simulation.js';

let state = createSimulation();
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function cacheText(entry, label) {
  const seconds = remaining(entry, state.time);
  return `${label}: ${seconds ? `${entry.value} · 残り ${seconds}秒` : 'なし / 期限切れ'}`;
}

function render() {
  const isAddress = state.scenario === 'address';
  $('#scenario-title').textContent = isAddress ? 'アドレスの変更' : '権威サーバーの移転';
  $('#scenario-description').textContent = isAddress
    ? '同じ権威サーバーで、Web サーバーのアドレスを変更します。'
    : '親ゾーンの委任先を変更。旧権威は古い答え、新権威は新しい答えを返します。';
  $('#clock').textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(state.time % 60).padStart(2, '0')}`;
  const browserCache = [
    cacheText(state.browserDns, 'DNS解決結果'),
    state.browserHttp && remaining(state.browserHttp, state.time)
      ? `HTTP: ${state.browserHttp.value.page} · 残り ${remaining(state.browserHttp, state.time)}秒`
      : 'HTTP: なし / 期限切れ'
  ];
  $('[data-browser-cache]').replaceChildren(...browserCache.map(line));
  const delegation = state.resolverDelegation && remaining(state.resolverDelegation, state.time)
    ? `${state.resolverDelegation.value === 'old' ? '旧' : '新'}権威 · 残り ${remaining(state.resolverDelegation, state.time)}秒`
    : 'なし / 期限切れ';
  const resolverCache = isAddress
    ? [cacheText(state.resolverAddress, state.type)]
    : [`委任先: ${delegation}`];
  $('[data-resolver-cache]').replaceChildren(...resolverCache.map(line));
  $('#record-description').textContent = isAddress
    ? ''
    : '権威サーバーの移転では、変更するのは親ゾーンの委任情報（旧・新権威サーバーに関する情報）です。上の A / AAAA レコードは、「旧権威」が古い答えを、「新権威」が新しい答えを返していることを示しています。';
  renderRecordDisplay(isAddress);
  renderWebPreview();
  $('#change').disabled = state.changed;
  $('#change span').textContent = state.changed ? '変更済み' : '設定を変更する';
  $$('#events li').forEach(item => item.remove());
  state.events.forEach((event, index) => {
    const item = document.createElement('li');
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('p');
    text.textContent = event;
    item.append(number, text);
    $('#events').append(item);
  });
  $$('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario)));
  $$('[data-type]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.type === state.type)));
}

function renderWebPreview() {
  const preview = $('#web-preview');
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
      ? 'ブラウザーの DNS キャッシュが新しいアドレスを指しているため、新しい表示になっています。'
      : 'ブラウザーの DNS キャッシュが古いアドレスを指しているため、古い表示のままです。';
  } else if (result.reason === 'resolver') {
    $('#web-preview-explanation').textContent = isNew
      ? 'フルサービスリゾルバのキャッシュが新しいアドレスを指しているため、新しい表示になっています。'
      : 'フルサービスリゾルバのキャッシュが有効なため、古い答えのまま表示しています。';
  } else if (isNew) {
    $('#web-preview-explanation').textContent = '権威サーバーから新しいアドレスの答えを取得しました。';
  } else {
    $('#web-preview-explanation').textContent = '権威サーバーから変更前のアドレスの答えを取得しました。';
  }
}

function line(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element;
}

function renderRecordDisplay(isAddress) {
  const values = ['A', 'AAAA'].map(type => {
    const isNew = state.changed && (!isAddress || type === state.type);
    return [type, ADDRESSES[type][isNew ? 'new' : 'old'], isAddress
      ? (isNew ? '変更後' : '現在')
      : (isNew ? '新権威' : '旧権威')];
  });
  $('#record-display').replaceChildren(...values.map(([type, address, status]) => {
    const row = document.createElement('div');
    row.className = 'record-row';
    const typeLabel = document.createElement('strong');
    typeLabel.textContent = type;
    const addressLabel = document.createElement('span');
    addressLabel.textContent = `${address} (TTL ${TTL.address}秒)`;
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
