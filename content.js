/* global chrome */

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEYS = ['messages', 'currentIndex'];
const TOAST_DURATION = 2500;

// ── Toast ──────────────────────────────────────────────────
let toastEl = null;
let toastTimer = null;

function ensureToast() {
  if (toastEl && document.body.contains(toastEl)) return;
  toastEl = document.createElement('div');
  toastEl.id = 'instamsg-toast';
  document.body.appendChild(toastEl);
}

function showToast(text) {
  ensureToast();
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, TOAST_DURATION);
}

// ── Clipboard ──────────────────────────────────────────────
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
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

// ── Cycle logic ────────────────────────────────────────────
async function copyNextMessage() {
  const result = await chrome.storage.local.get(STORAGE_KEYS);
  const messages = result.messages || [];
  let index = result.currentIndex || 0;

  if (messages.length === 0) {
    showToast('InstaMSG: Nenhuma mensagem na lista.');
    return;
  }

  // Clamp index
  if (index >= messages.length) index = 0;

  const message = messages[index];
  const ok = await copyToClipboard(message);

  if (ok) {
    const newIndex = (index + 1) % messages.length;
    await chrome.storage.local.set({ currentIndex: newIndex });
    showToast(`InstaMSG: Mensagem ${index + 1} de ${messages.length} copiada`);
  } else {
    showToast('InstaMSG: Erro ao copiar mensagem.');
  }
}

// ── Keyboard listener ──────────────────────────────────────
function handleKeydown(e) {
  // Ctrl+I or Cmd+I (Mac)
  if ((e.ctrlKey || e.metaKey) && e.key === 'i' && !e.altKey && !e.shiftKey) {
    // Don't intercept if user is typing in an input/textarea
    const tag = e.target.tagName.toLowerCase();
    const isEditable = e.target.isContentEditable || tag === 'input' || tag === 'textarea';
    if (isEditable) return;

    e.preventDefault();
    e.stopPropagation();
    copyNextMessage();
  }
}

document.addEventListener('keydown', handleKeydown, true);

// ── Listen for copy-now message from popup ─────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'copyNext') {
    copyNextMessage().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
});
