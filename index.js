/** Muchi Opening Selector v1.0.0 — switches the real first-message swipe. */
export const OPENING_SELECTOR_VERSION = '1.0.0';
const ROOT_SELECTOR = '[data-muchi-opening-selector="1"]';
const BINDINGS = new WeakSet();
const attached = new Map();
let timer = null;
let observer = null;

function helperFor(win) {
  for (let i = 0, w = win; w && i < 8; i++) {
    try {
      if (typeof w.TavernHelper?.setChatMessages === 'function') return w.TavernHelper;
      if (typeof w.setChatMessages === 'function') return w;
      if (!w.parent || w.parent === w) break;
      void w.parent.document;
      w = w.parent;
    } catch { break; }
  }
  return null;
}
function notice(win, message, kind = 'info') {
  try { (win.top?.toastr || win.toastr)?.[kind]?.(message); } catch {}
}
function state(root, message, pending = false) {
  const label = root.querySelector('[data-selector-status]');
  if (label) label.textContent = message;
  root.querySelectorAll('button[data-opening-swipe]').forEach(button => {
    button.disabled = pending;
    button.setAttribute('aria-busy', pending ? 'true' : 'false');
  });
}
export async function chooseOpening(root, index, helper = helperFor(root?.ownerDocument?.defaultView)) {
  if (!root || !Number.isInteger(index) || index < 1 || index > 4) return false;
  if (!helper) { state(root, '酒馆助手尚未就绪，请稍后重试，或用开场消息的翻页箭头选择。'); return false; }
  let first;
  try { first = helper.getChatMessages(0, { include_swipes: true })?.[0]; }
  catch { state(root, '无法读取开场页，请使用酒馆自带的翻页箭头。'); return false; }
  if (!first || first.role !== 'assistant' || !Array.isArray(first.swipes) || first.swipes.length <= index) {
    state(root, '开场页尚未载入，请刷新酒馆后重开聊天，或用翻页箭头选择。'); return false;
  }
  let last = 0;
  try { last = Number(helper.getLastMessageId?.() ?? 0); } catch {}
  if (last > 0) {
    state(root, '聊天已经开始。为保护现有剧情，请新建聊天后再选择开场。');
    return false;
  }
  if (first.swipe_id !== 0 || !String(first.swipes[0] || '').includes('<MuchiOpeningSelector/>')) {
    state(root, '当前已不在选择页。请用开场消息的翻页箭头切换。'); return false;
  }
  state(root, '正在进入所选故事…', true);
  try {
    await helper.setChatMessages([{ message_id: 0, swipe_id: index }], { refresh: 'all' });
    const current = helper.getChatMessages(0, { include_swipes: true })?.[0];
    if (current?.swipe_id !== index) throw new Error('消息页未切换');
    notice(root.ownerDocument.defaultView, `已进入第 ${index} 个开场`, 'success');
    return true;
  } catch (error) {
    state(root, '切换失败，请用酒馆的开场翻页箭头选择。');
    notice(root.ownerDocument.defaultView, `开场切换失败：${error?.message || error}`, 'error');
    return false;
  }
}
function bind(root) {
  if (BINDINGS.has(root)) return;
  BINDINGS.add(root);
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-opening-swipe]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    void chooseOpening(root, Number(button.dataset.openingSwipe));
  });
  root.querySelectorAll('button[data-opening-swipe]').forEach(button => {
    button.setAttribute('aria-label', `选择第 ${button.dataset.openingSwipe} 个开场：${button.dataset.title || ''}`);
  });
}
function scan(doc) {
  try {
    doc.querySelectorAll(ROOT_SELECTOR).forEach(bind);
    doc.querySelectorAll('iframe').forEach(frame => {
      try {
        const child = frame.contentDocument;
        if (child && child !== doc && child.documentElement) scan(child);
      } catch {}
    });
  } catch {}
}
export function mountOpeningSelector(win = window) {
  let host = win;
  try { for (let i = 0; i < 8 && host.parent && host.parent !== host; i++) {
    void host.parent.document; host = host.parent;
  }} catch {}
  if (host.__muchiOpeningSelector?.version === OPENING_SELECTOR_VERSION) return host.__muchiOpeningSelector;
  const api = { version: OPENING_SELECTOR_VERSION, chooseOpening, scan: () => scan(host.document), close: () => {
    if (timer) clearInterval(timer); observer?.disconnect();
    for (const [target, callback] of attached) target.removeEventListener('load', callback, true);
    attached.clear();
  }};
  host.__muchiOpeningSelector?.close?.();
  host.__muchiOpeningSelector = api;
  scan(host.document);
  // ST replaces the greeting iframe when swiping or rendering messages.
  observer = new MutationObserver(() => scan(host.document));
  observer.observe(host.document.body, { childList: true, subtree: true });
  const onLoad = () => scan(host.document);
  host.document.addEventListener('load', onLoad, true);
  attached.set(host.document, onLoad);
  timer = host.setInterval(() => scan(host.document), 2500);
  return api;
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') mountOpeningSelector(window);
