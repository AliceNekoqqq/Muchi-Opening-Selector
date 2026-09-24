/** Muchi Opening Selector v1.2.0 — opening swipes and synchronized music. */
export const OPENING_SELECTOR_VERSION = '1.2.0';
const ROOT_SELECTOR = '[data-muchi-opening-selector="1"]';
const LYRICS_URLS = [
  'https://cdn.jsdelivr.net/gh/AliceNekoqqq/Muchi-Opening-Selector@v1.2.0/Assets/Audio/time-machine.lrc',
  'https://testingcf.jsdelivr.net/gh/AliceNekoqqq/Muchi-Opening-Selector@v1.2.0/Assets/Audio/time-machine.lrc',
];
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
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export function parseLyrics(source) {
  const rows = new Map();
  for (const line of source.split(/\r?\n/)) {
    const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const content = line.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, '').trim();
    if (!content || /^(TME享有|Lyrics by|Composed by|time machine \(feat\.)/i.test(content)) continue;
    for (const match of matches) {
      const seconds = Number(match[1]) * 60 + Number(match[2]);
      const key = Math.round(seconds * 100) / 100;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(content);
    }
  }
  return [...rows].sort(([a], [b]) => a - b).map(([time, lines]) => ({ time, lines }));
}
function bindPlayer(root) {
  const panel = root.querySelector('[data-muchi-player]');
  if (!panel || panel.dataset.bound) return;
  panel.dataset.bound = '1';
  const audio = panel.querySelector('audio');
  const play = panel.querySelector('[data-music-play]');
  const seek = panel.querySelector('[data-music-seek]');
  const clock = panel.querySelector('[data-music-clock]');
  const lyricBox = panel.querySelector('[data-music-lyrics]');
  let rows = [], active = -1, dragging = false;
  const show = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!dragging) seek.value = String(duration ? Math.round(audio.currentTime / duration * 1000) : 0);
    clock.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    const next = rows.findIndex((row, i) => row.time <= audio.currentTime + .08 && (i === rows.length - 1 || rows[i + 1].time > audio.currentTime + .08));
    if (next === active) return;
    active = next;
    lyricBox.querySelectorAll('[data-lyric-row]').forEach((node, i) => {
      node.classList.toggle('is-active', i === active);
      node.setAttribute('aria-current', i === active ? 'true' : 'false');
    });
    if (active >= 0) {
      const node = lyricBox.querySelectorAll('[data-lyric-row]')[active];
      lyricBox.scrollTo({ top: node.offsetTop - lyricBox.offsetTop - (lyricBox.clientHeight - node.clientHeight) / 2, behavior: 'smooth' });
    }
  };
  const syncPlay = () => { play.textContent = audio.paused ? '▶' : 'Ⅱ'; play.setAttribute('aria-label', audio.paused ? '播放' : '暂停'); };
  play.addEventListener('click', async () => {
    try { if (audio.paused) await audio.play(); else audio.pause(); }
    catch { lyricBox.setAttribute('data-music-error', '浏览器阻止了播放，请再点一次播放。'); }
    syncPlay();
  });
  panel.querySelectorAll('[data-music-skip]').forEach(button => button.addEventListener('click', () => {
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + Number(button.dataset.musicSkip)));
    show();
  }));
  seek.addEventListener('pointerdown', () => { dragging = true; });
  seek.addEventListener('input', () => { dragging = true; clock.textContent = `${formatTime((audio.duration || 0) * Number(seek.value) / 1000)} / ${formatTime(audio.duration)}`; });
  seek.addEventListener('change', () => { if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number(seek.value) / 1000; dragging = false; show(); });
  seek.addEventListener('pointerup', () => { dragging = false; });
  audio.addEventListener('timeupdate', show);
  audio.addEventListener('loadedmetadata', show);
  audio.addEventListener('durationchange', show);
  audio.addEventListener('play', syncPlay);
  audio.addEventListener('pause', syncPlay);
  audio.addEventListener('ended', syncPlay);
  panel.classList.add('is-ready');
  (async () => {
    for (const url of LYRICS_URLS) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        rows = parseLyrics(await response.text());
        if (!rows.length) throw new Error('empty LRC');
        lyricBox.replaceChildren(...rows.map(row => {
          const item = root.ownerDocument.createElement('button');
          item.type = 'button'; item.className = 'muchi-lyric-row'; item.dataset.lyricRow = '1';
          item.setAttribute('aria-label', `跳转到 ${formatTime(row.time)}：${row.lines.join('，')}`);
          row.lines.slice(0, 2).forEach((line, i) => {
            const span = root.ownerDocument.createElement('span');
            span.className = i ? 'muchi-lyric-translation' : 'muchi-lyric-original';
            span.textContent = line;
            item.appendChild(span);
          });
          item.addEventListener('click', () => { audio.currentTime = row.time; show(); });
          return item;
        }));
        show();
        return;
      } catch {}
    }
    lyricBox.textContent = '歌词暂时无法载入，音乐仍可播放。';
  })();
}
export async function chooseOpening(root, index, helper = helperFor(root?.ownerDocument?.defaultView)) {
  if (!root || !Number.isInteger(index) || index < 1 || index > 5) return false;
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
  bindPlayer(root);
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
