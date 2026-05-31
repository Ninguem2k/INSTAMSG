/* global chrome */

// ── Constants ──────────────────────────────────────────────
const TOAST_DURATION = 2500;
const SHORTCUT_DEFAULTS = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' };
const SAVE_PERSON_SHORTCUT_DEFAULTS = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'o' };
const DONATION_PIX_KEY = 'ninguem2k@proton.me';
const DONATION_MSG_INTERVAL = 10;
const DONATION_HIDE_DAYS = 30;

// ── State ──────────────────────────────────────────────────
let currentShortcut = { ...SHORTCUT_DEFAULTS };
let currentSavePersonShortcut = { ...SAVE_PERSON_SHORTCUT_DEFAULTS };
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

// ── Donation overlay ───────────────────────────────────────
let donationOverlay = null;

function buildDonationOverlay() {
  if (donationOverlay) return donationOverlay;

  const overlay = document.createElement('div');
  overlay.id = 'instamsg-donation-overlay';
  overlay.innerHTML = `
    <div id="instamsg-donation-dialog">
      <div id="instamsg-donation-header">
        <span>Apoie o Criador</span>
        <button id="instamsg-donation-close">&times;</button>
      </div>
      <div id="instamsg-donation-body">
        <p>Este complemento e gratuito e de codigo aberto.<br>Se ele te ajuda, considere fazer uma doacao.</p>
        <div id="instamsg-donation-qr-wrapper">
          <img id="instamsg-donation-qr" src="" alt="QR Code Pix" width="180" height="180">
        </div>
        <p id="instamsg-donation-key-label">Chave Pix:</p>
        <code id="instamsg-donation-key">${DONATION_PIX_KEY}</code>
        <p id="instamsg-donation-suggestion">Valor sugerido: R$ 5,00</p>
        <p id="instamsg-donation-note">Voce pode fechar e continuar usando normalmente.</p>
      </div>
      <div id="instamsg-donation-footer">
        <button id="instamsg-donation-dismiss">Agora nao</button>
        <button id="instamsg-donation-donated">Ja doei! Remover por 30 dias</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  donationOverlay = overlay;

  const qrImg = overlay.querySelector('#instamsg-donation-qr');
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(DONATION_PIX_KEY)}`;

  overlay.querySelector('#instamsg-donation-close').addEventListener('click', hideDonationDialog);
  overlay.querySelector('#instamsg-donation-dismiss').addEventListener('click', hideDonationDialog);
  overlay.querySelector('#instamsg-donation-donated').addEventListener('click', async () => {
    const hideUntil = Date.now() + DONATION_HIDE_DAYS * 24 * 60 * 60 * 1000;
    await chrome.storage.local.set({ donationDismissedUntil: hideUntil });
    hideDonationDialog();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideDonationDialog();
  });

  return overlay;
}

function showDonationDialog() {
  if (!document.body) return;
  const overlay = buildDonationOverlay();
  overlay.style.display = 'flex';
}

function hideDonationDialog() {
  if (donationOverlay) donationOverlay.style.display = 'none';
}

async function checkDonation(totalCopies) {
  const { donationDismissedUntil } = await chrome.storage.local.get('donationDismissedUntil');
  const dismissed = donationDismissedUntil || 0;
  if (dismissed > Date.now()) return;
  if (totalCopies > 0 && totalCopies % DONATION_MSG_INTERVAL === 0) {
    showDonationDialog();
  }
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

    // Increment total copy counter for donation nudge
    const { totalCopies } = await chrome.storage.local.get('totalCopies');
    const newTotal = (totalCopies || 0) + 1;

    await chrome.storage.local.set({ groups, totalCopies: newTotal });
    showToast(`InstaMSG: Mensagem ${index + 1}/${messages.length} copiada`);
    checkDonation(newTotal);
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

// ── Save person shortcut ─────────────────────────────────────
function buildSavePersonHandler() {
  const sc = currentSavePersonShortcut;
  return function handleKeydown(e) {
    if (!sc || !sc.key) return;

    const ctrlMatch = sc.ctrlKey ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
    const shiftMatch = sc.shiftKey ? e.shiftKey : !e.shiftKey;
    const altMatch = sc.altKey ? e.altKey : !e.altKey;
    const metaMatch = sc.metaKey ? e.metaKey : true;

    if (ctrlMatch && shiftMatch && altMatch && metaMatch && e.key.toLowerCase() === sc.key.toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      savePerson();
    }
  };
}

let savePersonHandler = null;

function extractUsername(text) {
  // Try extracting from Instagram URL: https://www.instagram.com/username/...
  let match = text.match(/instagram\.com\/([a-zA-Z0-9._]{1,30})\/?/);
  if (match) return match[1];

  // Try finding @username pattern anywhere in text
  match = text.match(/@([a-zA-Z0-9._]{1,30})/);
  if (match) return match[1];

  // Try whole text (after trimming) as bare username
  const cleaned = text.trim();
  match = cleaned.match(/^([a-zA-Z0-9._]{1,30})$/);
  if (match) return match[1];

  return null;
}

async function readClipboardText() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      document.execCommand('paste');
      const text = ta.value;
      ta.remove();
      return text;
    } catch {
      return null;
    }
  }
}

async function savePerson() {
  const text = await readClipboardText();
  if (!text || !text.trim()) {
    showToast('InstaMSG: Area de transferencia vazia.');
    return;
  }

  const username = extractUsername(text);
  if (!username) {
    showToast('InstaMSG: Texto nao parece um @usuario valido.');
    return;
  }

  const { people } = await chrome.storage.local.get('people');
  const list = people || [];

  if (list.some(p => p.username === username)) {
    showToast(`InstaMSG: @${username} ja esta na lista.`);
    return;
  }

  list.push({ username, savedAt: Date.now() });
  await chrome.storage.local.set({ people: list });
  showToast(`InstaMSG: @${username} salvo! (${list.length} pessoa${list.length !== 1 ? 's' : ''})`);
}

// ── Attach / detach listener ───────────────────────────────
function attachListener() {
  if (attached && keydownHandler) return;
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    window.removeEventListener('keydown', keydownHandler, true);
  }
  if (savePersonHandler) {
    document.removeEventListener('keydown', savePersonHandler, true);
    window.removeEventListener('keydown', savePersonHandler, true);
  }
  keydownHandler = buildShortcutHandler(currentShortcut);
  savePersonHandler = buildSavePersonHandler();
  // Both document and window for maximum coverage in SPAs
  document.addEventListener('keydown', keydownHandler, true);
  window.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('keydown', savePersonHandler, true);
  window.addEventListener('keydown', savePersonHandler, true);
  attached = true;
}

async function initShortcut() {
  const result = await chrome.storage.local.get(['shortcut', 'savePersonShortcut']);
  currentShortcut = result.shortcut || { ...SHORTCUT_DEFAULTS };
  currentSavePersonShortcut = result.savePersonShortcut || { ...SAVE_PERSON_SHORTCUT_DEFAULTS };
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
  if (areaName !== 'local') return;
  if (changes.shortcut || changes.savePersonShortcut) {
    if (changes.shortcut) currentShortcut = changes.shortcut.newValue || { ...SHORTCUT_DEFAULTS };
    if (changes.savePersonShortcut) currentSavePersonShortcut = changes.savePersonShortcut.newValue || { ...SAVE_PERSON_SHORTCUT_DEFAULTS };
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
