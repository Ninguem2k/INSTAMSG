/* global chrome */

// ── Constants ──────────────────────────────────────────────
const TOAST_DURATION = 2500;
const SHORTCUT_DEFAULTS = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' };

// ── State ──────────────────────────────────────────────────
let currentShortcut = { ...SHORTCUT_DEFAULTS };
let keydownHandler = null;
let attached = false;

// ── Toast ──────────────────────────────────────────────────
let toastEl = null;
let toastTimer = null;

function ensureToast() {
  if (toastEl && document.body && document.body.contains(toastEl)) return;
  if (!document.body) return;
  toastEl = document.createElement('div');
  toastEl.id = 'instamsg-toast';
  document.body.appendChild(toastEl);
}

function showToast(text) {
  ensureToast();
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.classList.remove('show');
  }, TOAST_DURATION);
}

// ── Clipboard ──────────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

// ── Cycle logic (group-aware) ──────────────────────────────
async function copyNextMessage() {
  const result = await chrome.storage.local.get(['groups', 'activeGroupId']);
  const groups = result.groups || {};
  const gid = result.activeGroupId;
  const group = groups[gid];

  if (!group) {
    showToast('InstaMSG: Nenhum grupo ativo.');
    return;
  }

  const messages = group.messages || [];
  let index = group.currentIndex || 0;

  if (messages.length === 0) {
    showToast('InstaMSG: Nenhuma mensagem na lista.');
    return;
  }

  if (index >= messages.length) index = 0;

  const message = messages[index];
  const ok = await copyToClipboard(message);

  if (ok) {
    const newIndex = (index + 1) % messages.length;
    groups[gid].currentIndex = newIndex;
    await chrome.storage.local.set({ groups });
    showToast(`InstaMSG: Mensagem ${index + 1}/${messages.length} copiada`);
  } else {
    showToast('InstaMSG: Erro ao copiar mensagem.');
  }
}

// ── Dynamic keyboard shortcut ──────────────────────────────
function buildShortcutHandler(sc) {
  return function handleKeydown(e) {
    if (!sc || !sc.key) return;

    const ctrlMatch = sc.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
    const shiftMatch = sc.shiftKey ? e.shiftKey : !e.shiftKey;
    const altMatch = sc.altKey ? e.altKey : !e.altKey;
    const metaMatch = sc.metaKey ? e.metaKey : true;

    if (ctrlMatch && shiftMatch && altMatch && metaMatch && e.key.toLowerCase() === sc.key.toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      copyNextMessage();
    }
  };
}

// ── Attach / detach listener ───────────────────────────────
function attachListener() {
  if (attached && keydownHandler) return;
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    window.removeEventListener('keydown', keydownHandler, true);
  }
  keydownHandler = buildShortcutHandler(currentShortcut);
  // Both document and window for maximum coverage in SPAs
  document.addEventListener('keydown', keydownHandler, true);
  window.addEventListener('keydown', keydownHandler, true);
  attached = true;
}

async function initShortcut() {
  const result = await chrome.storage.local.get('shortcut');
  currentShortcut = result.shortcut || { ...SHORTCUT_DEFAULTS };
  attachListener();
}

// ── SPA navigation guard ───────────────────────────────────
// Instagram SPA may detach listeners on route change.
// MutationObserver on body ensures we re-attach if body is replaced.
function startBodyObserver() {
  const observer = new MutationObserver(() => {
    if (!document.body) return;
    ensureToast();
    // Re-attach on any major DOM mutation that could indicate SPA nav
    attachListener();
  });

  const config = { childList: true, subtree: true };
  if (document.body) {
    observer.observe(document.body, config);
  } else {
    // Body not ready yet — wait for it
    const bodyCheck = setInterval(() => {
      if (document.body) {
        observer.observe(document.body, config);
        clearInterval(bodyCheck);
        attachListener();
        ensureToast();
      }
    }, 200);
  }
}

// ── URL change detection (SPA routing) ─────────────────────
let lastUrl = location.href;
function checkUrlChange() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // SPA route changed — ensure listener is attached
    attachListener();
  }
}
setInterval(checkUrlChange, 1000);

// Also hook into popstate/hashchange
window.addEventListener('popstate', () => { lastUrl = location.href; attachListener(); });
window.addEventListener('hashchange', () => { lastUrl = location.href; attachListener(); });

// ── Storage change listener ────────────────────────────────
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.shortcut) {
    currentShortcut = changes.shortcut.newValue || { ...SHORTCUT_DEFAULTS };
    attached = false;
    attachListener();
  }
});

// ── Message relay from popup ───────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'copyNext') {
    copyNextMessage().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ── Init ───────────────────────────────────────────────────
initShortcut();
startBodyObserver();
