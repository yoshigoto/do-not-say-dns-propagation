import { ADDRESSES, advance, change, clearBrowser, clearHttp, createSimulation, remaining, request } from './simulation.js';

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
  $('#type-label').textContent = state.type;
  $('#clock').textContent = `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(state.time % 60).padStart(2, '0')}`;
  $('#browser-status').replaceChildren(...[
    cacheText(state.browserDns, 'DNS'),
    state.browserHttp && remaining(state.browserHttp, state.time)
      ? `HTTP: ${state.browserHttp.value.page} · 残り ${remaining(state.browserHttp, state.time)}秒`
      : 'HTTP: なし / 期限切れ'
  ].map(line));
  const delegation = state.resolverDelegation && remaining(state.resolverDelegation, state.time)
    ? `${state.resolverDelegation.value === 'old' ? '旧' : '新'}権威 · 残り ${remaining(state.resolverDelegation, state.time)}秒`
    : 'なし / 期限切れ';
  $('#resolver-status').replaceChildren(line(cacheText(state.resolverAddress, state.type)), line(`委任先: ${delegation}`));
  $('#authority-description').textContent = isAddress ? '権威ゾーンの現在の答え' : '親ゾーンの現在の委任先';
  $('#authority-status').replaceChildren(...(isAddress
    ? [`${state.type}: ${ADDRESSES[state.type][state.changed ? 'new' : 'old']}`, '委任先: 変更なし']
    : [`委任先: ${state.changed ? '新' : '旧'}権威`, `旧: ${ADDRESSES[state.type].old}`, `新: ${ADDRESSES[state.type].new}`]
  ).map(line));
  $('#web-status').replaceChildren(...(state.result
    ? [state.result.page, state.result.address, `表示元: ${state.result.source}`]
    : ['まだアクセスしていません']).map(line));
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
    $('#web-preview-cache').textContent = 'CACHE ≠ PROPAGATION';
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
    $('#web-preview-cache').textContent = 'HTTP CACHE HIT';
  } else if (result.reason === 'browser-dns') {
    $('#web-preview-explanation').textContent = isNew
      ? 'ブラウザーの DNS キャッシュが新しいアドレスを指しているため、新しい表示になっています。'
      : 'ブラウザーの DNS キャッシュが古いアドレスを指しているため、古い表示のままです。';
    $('#web-preview-cache').textContent = 'BROWSER DNS CACHE';
  } else if (result.reason === 'resolver') {
    $('#web-preview-explanation').textContent = 'フルサービスリゾルバのキャッシュが有効なため、古い答えのまま表示しています。';
    $('#web-preview-cache').textContent = 'RESOLVER CACHE HIT';
  } else if (isNew) {
    $('#web-preview-explanation').textContent = 'キャッシュが期限切れになり、権威サーバーから新しい答えを取得しました。';
    $('#web-preview-cache').textContent = 'CACHE EXPIRED → NEW';
  } else {
    $('#web-preview-explanation').textContent = 'キャッシュまたは古い委任先により、権威サーバーから古い答えを取得しました。';
    $('#web-preview-cache').textContent = 'OLD ANSWER STILL CACHED';
  }
}

function line(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element;
}

$('#request').addEventListener('click', () => { request(state); render(); });
$('#change').addEventListener('click', () => { change(state); render(); });
$('#clear').addEventListener('click', () => { clearBrowser(state); render(); });
$('#clear-http').addEventListener('click', () => { clearHttp(state); render(); });
$('#reset').addEventListener('click', () => { state = createSimulation(state.scenario, state.type); render(); });
$$('[data-advance]').forEach(button => button.addEventListener('click', () => { advance(state, Number(button.dataset.advance)); render(); }));
$$('[data-scenario]').forEach(button => button.addEventListener('click', () => { state = createSimulation(button.dataset.scenario, state.type); render(); }));
$$('[data-type]').forEach(button => button.addEventListener('click', () => { state = createSimulation(state.scenario, button.dataset.type); render(); }));
render();
