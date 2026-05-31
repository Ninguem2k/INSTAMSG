/* global chrome */

// ── DOM refs ──────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Tabs
const tabs = $$('.tab');
const panels = $$('.panel');

// Config
const apiProvider = $('#api-provider');
const apiKey = $('#api-key');
const ollamaUrl = $('#ollama-url');
const ollamaModel = $('#ollama-model');
const numVariations = $('#num-variations');
const temperature = $('#temperature');
const language = $('#language');
const baseText = $('#base-text');
const btnGenerate = $('#btn-generate');
const btnClearGen = $('#btn-clear-generate');
const generateError = $('#generate-error');
const numLabel = $('#num-label');
const tempLabel = $('#temp-label');

// Messages
const groupSelector = $('#group-selector');
const btnManageGroups = $('#btn-manage-groups');
const msgList = $('#msg-list');
const msgCount = $('#msg-count');
const msgGroupBadge = $('#msg-group-badge');
const btnAddMsg = $('#btn-add-msg');
const btnSave = $('#btn-save');

// Shortcut
const shortcutCapture = $('#shortcut-capture');
const shortcutDisplay = $('#shortcut-display');
const shortcutHint = $('#shortcut-hint');
const shortcutConflict = $('#shortcut-conflict');
const shortcutDesc = $('#shortcut-desc');
const statusIndex = $('#status-index');
const btnCopyNow = $('#btn-copy-now');
const copyToast = $('#copy-toast');

// Dialog
const dialogOverlay = $('#dialog-overlay');
const groupManageList = $('#group-manage-list');
const btnCreateGroup = $('#btn-create-group');
const btnCloseDialog = $('#btn-close-dialog');

// Shared
const statusBar = $('#status-bar');

// ── State ──────────────────────────────────────────────────
let groups = {};
let activeGroupId = null;
let shortcut = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' };
let isRecording = false;

// ── Active group helpers ───────────────────────────────────
function activeGroup() {
  return groups[activeGroupId] || { name: 'Geral', messages: [], currentIndex: 0 };
}
function getMessages() { return activeGroup().messages; }

let saveTimer = null;
function debouncedSaveGroups() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ groups, activeGroupId }), 400);
}

async function saveGroupsNow() {
  clearTimeout(saveTimer);
  await chrome.storage.local.set({ groups, activeGroupId });
}

// ── Migration v1 → v2 ──────────────────────────────────────
async function migrateIfNeeded(all) {
  if (all._schemaVersion >= 2) return;

  const legacyMessages = all.messages || [];
  const legacyIndex = all.currentIndex || 0;

  groups = {
    default: {
      name: 'Geral',
      messages: legacyMessages,
      currentIndex: legacyIndex,
      createdAt: Date.now()
    }
  };
  activeGroupId = 'default';

  await chrome.storage.local.set({
    groups,
    activeGroupId,
    shortcut: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' },
    _schemaVersion: 2
  });
}

// ── Load settings ──────────────────────────────────────────
async function loadSettings() {
  const result = await chrome.storage.local.get([
    'baseText', 'groups', 'activeGroupId', 'shortcut',
    'apiProvider', 'apiKey', 'ollamaUrl', 'ollamaModel',
    'temperature', 'numVariations', 'language', '_schemaVersion'
  ]);

  await migrateIfNeeded(result);

  groups = result.groups || {};
  activeGroupId = result.activeGroupId;
  shortcut = result.shortcut || { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' };

  // Validate activeGroupId exists
  if (!groups[activeGroupId]) {
    const firstId = Object.keys(groups)[0];
    if (firstId) {
      activeGroupId = firstId;
    } else {
      groups.default = { name: 'Geral', messages: [], currentIndex: 0, createdAt: Date.now() };
      activeGroupId = 'default';
    }
    await chrome.storage.local.set({ groups, activeGroupId });
  }

  baseText.value = result.baseText || '';
  apiProvider.value = result.apiProvider || 'openai';
  apiKey.value = result.apiKey || '';
  ollamaUrl.value = result.ollamaUrl || 'http://localhost:11434';
  ollamaModel.value = result.ollamaModel || 'llama3';
  temperature.value = result.temperature ?? 0.8;
  numVariations.value = result.numVariations ?? 5;
  language.value = result.language || 'pt';

  numLabel.textContent = numVariations.value;
  tempLabel.textContent = temperature.value;

  updateProviderFields();
  renderGroupSelector();
  renderMessageList();
  renderShortcutDisplay();
  updateShortcutStatus();
  toggleClearGenBtn();

  const hasProvider = apiProvider.value === 'ollama' || (result.apiKey && result.apiKey.trim().length > 0);
  const hasMessages = getMessages().length > 0;
  if (hasProvider && hasMessages) {
    switchTab('messages');
  }
}

// ── Save single setting ────────────────────────────────────
function saveSetting(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// ── Provider field toggle ──────────────────────────────────
function updateProviderFields() {
  const prov = apiProvider.value;
  $('#field-api-key').style.display = prov === 'ollama' ? 'none' : '';
  $('#field-ollama-url').style.display = prov === 'ollama' ? '' : 'none';
  $('#field-ollama-model').style.display = prov === 'ollama' ? '' : 'none';
}

apiProvider.addEventListener('change', () => {
  updateProviderFields();
  saveSetting('apiProvider', apiProvider.value);
});

// ── Range inputs ───────────────────────────────────────────
numVariations.addEventListener('input', () => {
  numLabel.textContent = numVariations.value;
  saveSetting('numVariations', Number(numVariations.value));
});
temperature.addEventListener('input', () => {
  tempLabel.textContent = temperature.value;
  saveSetting('temperature', Number(temperature.value));
});

// ── Save on change ─────────────────────────────────────────
apiKey.addEventListener('change', () => saveSetting('apiKey', apiKey.value));
ollamaUrl.addEventListener('change', () => saveSetting('ollamaUrl', ollamaUrl.value));
ollamaModel.addEventListener('change', () => saveSetting('ollamaModel', ollamaModel.value));
language.addEventListener('change', () => saveSetting('language', language.value));
baseText.addEventListener('blur', () => saveSetting('baseText', baseText.value));

// ── Tabs ───────────────────────────────────────────────────
function switchTab(tabName) {
  tabs.forEach(t => t.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  const tabBtn = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const panel = document.getElementById(`panel-${tabName}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (panel) panel.classList.add('active');
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ── Group: Render selector ─────────────────────────────────
function renderGroupSelector() {
  groupSelector.innerHTML = '';
  const ids = Object.keys(groups);
  ids.forEach(id => {
    const g = groups[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = g.name + ' (' + (g.messages ? g.messages.length : 0) + ')';
    if (id === activeGroupId) opt.selected = true;
    groupSelector.appendChild(opt);
  });
  msgGroupBadge.textContent = activeGroup().name;
}

// ── Group: Switch ──────────────────────────────────────────
async function switchGroup(groupId) {
  if (!groups[groupId]) return;
  activeGroupId = groupId;
  await chrome.storage.local.set({ activeGroupId });
  renderGroupSelector();
  renderMessageList();
  updateShortcutStatus();
  toggleClearGenBtn();
}

groupSelector.addEventListener('change', () => {
  switchGroup(groupSelector.value);
});

// ── Group: Toggle clear-gen button ─────────────────────────
function toggleClearGenBtn() {
  btnClearGen.style.display = getMessages().length > 0 ? '' : 'none';
}

// ── Dialog: Open / Close ───────────────────────────────────
function openGroupManager() {
  renderGroupManageList();
  dialogOverlay.style.display = 'flex';
}

function closeGroupManager() {
  dialogOverlay.style.display = 'none';
  renderGroupSelector();
  updateShortcutStatus();
  toggleClearGenBtn();
}

btnManageGroups.addEventListener('click', openGroupManager);
btnCloseDialog.addEventListener('click', closeGroupManager);
dialogOverlay.addEventListener('click', (e) => {
  if (e.target === dialogOverlay) closeGroupManager();
});

// ── Dialog: Render list ────────────────────────────────────
function renderGroupManageList() {
  groupManageList.innerHTML = '';
  const ids = Object.keys(groups);
  ids.forEach(id => {
    const g = groups[id];
    const isActive = id === activeGroupId;
    const li = document.createElement('li');
    li.className = 'group-manage-item' + (isActive ? ' active-row' : '');
    li.dataset.groupId = id;
    li.innerHTML = `
      <span class="group-manage-name">${escapeHtml(g.name)}</span>
      <span class="group-manage-count">${g.messages ? g.messages.length : 0} msgs</span>
      ${!isActive ? '<button class="btn-activate-group" title="Ativar">&#9654;</button>' : '<span style="width:26px;flex-shrink:0"></span>'}
      <button class="btn-rename-group" title="Renomear">&#9998;</button>
      <button class="btn-delete-group" title="Excluir">&#10005;</button>
    `;
    groupManageList.appendChild(li);
  });

  // Activate handler
  groupManageList.querySelectorAll('.btn-activate-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.closest('.group-manage-item').dataset.groupId;
      await switchGroup(gid);
      renderGroupManageList();
    });
  });

  // Rename handler
  groupManageList.querySelectorAll('.btn-rename-group').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.group-manage-item');
      startRename(item);
    });
  });

  // Delete handler
  groupManageList.querySelectorAll('.btn-delete-group').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.closest('.group-manage-item').dataset.groupId;
      await deleteGroup(gid);
    });
  });
}

// ── Dialog: Inline rename ──────────────────────────────────
function startRename(item) {
  const gid = item.dataset.groupId;
  const nameSpan = item.querySelector('.group-manage-name');
  const oldName = nameSpan.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = oldName;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const finish = () => {
    const newName = input.value.trim() || oldName;
    if (newName && groups[gid]) {
      groups[gid].name = newName;
      saveGroupsNow();
    }
    renderGroupManageList();
    renderGroupSelector();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = oldName; input.blur(); }
  });
}

// ── Group: Create ──────────────────────────────────────────
async function createGroup(name) {
  const id = 'g' + Date.now().toString(36);
  groups[id] = { name, messages: [], currentIndex: 0, createdAt: Date.now() };
  await saveGroupsNow();
  renderGroupSelector();
  renderMessageList();
  toggleClearGenBtn();
  return id;
}

btnCreateGroup.addEventListener('click', async () => {
  const name = 'Novo grupo';
  await createGroup(name);
  activeGroupId = Object.keys(groups).pop();
  await chrome.storage.local.set({ activeGroupId });
  switchGroup(activeGroupId);
  renderGroupManageList();
  statusBar.textContent = 'Grupo criado.';
});

// ── Group: Delete ──────────────────────────────────────────
async function deleteGroup(groupId) {
  const ids = Object.keys(groups);
  if (ids.length <= 1) {
    statusBar.textContent = 'Mantenha pelo menos um grupo.';
    return;
  }
  if (activeGroupId === groupId) {
    const remaining = ids.find(id => id !== groupId);
    activeGroupId = remaining;
  }
  delete groups[groupId];
  await saveGroupsNow();
  renderGroupManageList();
  renderGroupSelector();
  renderMessageList();
  updateShortcutStatus();
  toggleClearGenBtn();
  statusBar.textContent = 'Grupo removido.';
}

// ── AI: Prompt builder ─────────────────────────────────────
function buildPrompt(text, n, temp, lang) {
  const langNames = { pt: 'Portugues', en: 'English', es: 'Espanol', fr: 'Francais', de: 'Deutsch', it: 'Italiano' };
  return [
    `Gere exatamente ${n} variacoes diferentes da mensagem abaixo.`,
    `Requisitos:`,
    `- Mantenha o significado e tom geral da mensagem original.`,
    `- Cada variacao deve soar natural, como se enviada por uma pessoa real em uma conversa.`,
    `- Varie vocabulario, estrutura das frases, e informalidade.`,
    `- IMPORTANTE: Se a mensagem original contiver placeholders como {nome}, {empresa}, {cidade}, etc., mantenha-os EXATAMENTE iguais em todas as variacoes geradas. Substitua apenas o texto ao redor deles.`,
    `- Use o idioma: ${langNames[lang] || lang}.`,
    `- Nivel de criatividade: ${temp} (0 = conservador, 2 = muito criativo).`,
    `- Responda APENAS com as ${n} variacoes, uma por linha, sem numeracao, sem aspas, sem texto adicional.`,
    ``,
    `Mensagem original:`,
    text
  ].join('\n');
}

function parseResponse(raw, n) {
  return raw
    .split('\n')
    .map(line => line.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim())
    .filter(line => line.length > 0)
    .slice(0, n);
}

// ── AI: API Calls ──────────────────────────────────────────
async function callOpenAICompat(endpoint, model, prompt, key, temp, n) {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Voce gera variacoes de mensagens de texto. Responda apenas com as variacoes solicitadas.' },
        { role: 'user', content: prompt }
      ],
      temperature: temp,
      max_tokens: 150 * n
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOpenAI(prompt, key, temp, n) {
  return callOpenAICompat('https://api.openai.com/v1/chat/completions', 'gpt-3.5-turbo', prompt, key, temp, n);
}

async function callDeepSeek(prompt, key, temp, n) {
  return callOpenAICompat('https://api.deepseek.com/chat/completions', 'deepseek-chat', prompt, key, temp, n);
}

async function callGemini(prompt, key, temp, n) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: temp, maxOutputTokens: 150 * n }
      })
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOllama(prompt, url, model, temp, n) {
  const resp = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: temp, num_predict: 150 * n }
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Erro HTTP ${resp.status} — Ollama esta rodando?`);
  }

  const data = await resp.json();
  return data.response || '';
}

// ── Generate action ────────────────────────────────────────
async function doGenerate() {
  const text = baseText.value.trim();
  if (!text) {
    showError('Digite um texto base primeiro.');
    return false;
  }

  const prov = apiProvider.value;
  const key = apiKey.value.trim();
  const n = Number(numVariations.value);
  const temp = Number(temperature.value);
  const lang = language.value;

  if (prov !== 'ollama' && !key) {
    showError('Configure sua chave de API primeiro.');
    return false;
  }

  btnGenerate.disabled = true;
  btnClearGen.disabled = true;
  btnGenerate.querySelector('.btn-text').textContent = 'Gerando...';
  btnGenerate.querySelector('.spinner').style.display = 'inline-block';
  generateError.style.display = 'none';
  statusBar.textContent = 'Conectando a IA...';

  try {
    const prompt = buildPrompt(text, n, temp, lang);
    let raw;

    if (prov === 'openai') {
      raw = await callOpenAI(prompt, key, temp, n);
    } else if (prov === 'deepseek') {
      raw = await callDeepSeek(prompt, key, temp, n);
    } else if (prov === 'gemini') {
      raw = await callGemini(prompt, key, temp, n);
    } else if (prov === 'ollama') {
      raw = await callOllama(prompt, ollamaUrl.value.trim(), ollamaModel.value.trim(), temp, n);
    } else {
      throw new Error('Provedor desconhecido.');
    }

    const parsed = parseResponse(raw, n);

    if (parsed.length === 0) {
      throw new Error('Resposta da IA nao continha variacoes validas. Tente novamente.');
    }

    groups[activeGroupId].messages = parsed;
    groups[activeGroupId].currentIndex = 0;
    await chrome.storage.local.set({ groups, activeGroupId, baseText: text });
    renderMessageList();
    renderGroupSelector();
    updateShortcutStatus();
    toggleClearGenBtn();
    statusBar.textContent = `${parsed.length} variacoes geradas.`;
    switchTab('messages');
    return true;

  } catch (err) {
    showError(err.message);
    statusBar.textContent = 'Erro na geracao.';
    return false;
  } finally {
    btnGenerate.disabled = false;
    btnClearGen.disabled = false;
    btnGenerate.querySelector('.btn-text').textContent = 'Gerar variacoes com IA';
    btnGenerate.querySelector('.spinner').style.display = 'none';
  }
}

btnGenerate.addEventListener('click', doGenerate);

function showError(msg) {
  generateError.textContent = msg;
  generateError.style.display = 'block';
}

// ── Clear & Generate ───────────────────────────────────────
btnClearGen.addEventListener('click', async () => {
  groups[activeGroupId].messages = [];
  groups[activeGroupId].currentIndex = 0;
  await saveGroupsNow();
  renderMessageList();
  updateShortcutStatus();
  toggleClearGenBtn();
  statusBar.textContent = 'Mensagens limpas. Gerando novas...';
  await doGenerate();
});

// ── Message list rendering ─────────────────────────────────
function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function renderMessageList() {
  const msgs = getMessages();
  const cIdx = activeGroup().currentIndex;

  msgList.innerHTML = '';
  msgs.forEach((msg, i) => {
    const li = document.createElement('li');
    li.className = 'msg-item' + (i === cIdx ? ' current' : '');
    li.dataset.msgIndex = i;
    li.innerHTML = `
      <span class="index">${i + 1}</span>
      <textarea rows="1" data-index="${i}">${escapeHtml(msg)}</textarea>
      <button class="btn-remove" data-index="${i}" title="Remover">&times;</button>
    `;
    msgList.appendChild(li);
  });
  msgCount.textContent = `${msgs.length} mensagem${msgs.length !== 1 ? 'ns' : ''}`;
  msgGroupBadge.textContent = activeGroup().name;

  // Init auto-resize + edit handler
  msgList.querySelectorAll('textarea').forEach(ta => {
    autoResize(ta);
    ta.addEventListener('focus', () => autoResize(ta));
    ta.addEventListener('input', () => {
      const idx = Number(ta.dataset.index);
      groups[activeGroupId].messages[idx] = ta.value;
      autoResize(ta);
      debouncedSaveGroups();
    });
  });

  // Remove handler
  msgList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      groups[activeGroupId].messages.splice(idx, 1);
      if (activeGroup().currentIndex >= getMessages().length) {
        groups[activeGroupId].currentIndex = Math.max(0, getMessages().length - 1);
      }
      debouncedSaveGroups();
      renderMessageList();
      renderGroupSelector();
      toggleClearGenBtn();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Add message ────────────────────────────────────────────
btnAddMsg.addEventListener('click', () => {
  groups[activeGroupId].messages.push('');
  renderMessageList();
  renderGroupSelector();
  toggleClearGenBtn();
  const last = msgList.querySelector('textarea:last-of-type');
  if (last) last.focus();
});

// ── Save list ──────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  msgList.querySelectorAll('textarea').forEach(ta => {
    const idx = Number(ta.dataset.index);
    groups[activeGroupId].messages[idx] = ta.value;
  });

  groups[activeGroupId].messages = groups[activeGroupId].messages.filter(m => m.trim() !== '');
  if (getMessages().length === 0) {
    await saveGroupsNow();
    statusBar.textContent = 'Adicione pelo menos uma mensagem.';
    renderMessageList();
    renderGroupSelector();
    toggleClearGenBtn();
    return;
  }

  groups[activeGroupId].currentIndex = Math.min(activeGroup().currentIndex, getMessages().length - 1);
  await saveGroupsNow();
  renderMessageList();
  renderGroupSelector();
  updateShortcutStatus();
  toggleClearGenBtn();
  statusBar.textContent = 'Lista salva.';
});

// ── Copy highlight ─────────────────────────────────────────
function highlightMessageItem(idx) {
  const item = msgList.querySelector(`[data-msg-index="${idx}"]`);
  if (!item) return;
  item.classList.add('copied-highlight');
  item.addEventListener('animationend', () => {
    item.classList.remove('copied-highlight');
  }, { once: true });
}

// ── Shortcut: Render display ───────────────────────────────
function renderShortcutDisplay() {
  const parts = [];
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.metaKey) parts.push('Cmd');
  if (shortcut.key) parts.push(shortcut.key.toUpperCase());

  const combo = parts.join(' + ') || 'Nenhum';
  shortcutDisplay.textContent = combo;
  shortcutDesc.innerHTML = `Pressione <strong>${combo}</strong> em qualquer pagina do Instagram para copiar a proxima mensagem da lista e alternar ciclicamente.`;
}

// ── Shortcut: Conflict check ───────────────────────────────
function checkShortcutConflicts() {
  const conflicts = [
    { ctrlKey: true, key: 't' },
    { ctrlKey: true, key: 'w' },
    { ctrlKey: true, key: 'n' },
    { ctrlKey: true, key: 'l' },
    { ctrlKey: true, key: 'd' },
    { ctrlKey: true, key: 'r' },
    { ctrlKey: true, key: 'f' },
    { ctrlKey: true, key: 'h' },
    { ctrlKey: true, key: 'j' },
    { ctrlKey: true, key: 'p' },
    { ctrlKey: true, key: 's' },
    { ctrlKey: true, key: 'u' },
    { ctrlKey: true, key: 'a' },
  ];
  const isConflict = conflicts.some(c =>
    c.ctrlKey === shortcut.ctrlKey &&
    c.key === shortcut.key &&
    !shortcut.shiftKey && !shortcut.altKey && !shortcut.metaKey
  );
  shortcutConflict.style.display = isConflict ? 'block' : 'none';
}

async function saveShortcut() {
  await chrome.storage.local.set({ shortcut });
}

// ── Shortcut: Key capture ──────────────────────────────────
shortcutCapture.addEventListener('focus', () => {
  isRecording = true;
  shortcutCapture.classList.add('recording');
  shortcutHint.textContent = 'Pressione a combinacao desejada...';
});

shortcutCapture.addEventListener('blur', () => {
  isRecording = false;
  shortcutCapture.classList.remove('recording');
  shortcutHint.textContent = 'Clique aqui e pressione a nova tecla';
});

shortcutCapture.addEventListener('keydown', (e) => {
  if (!isRecording) return;
  e.preventDefault();
  e.stopPropagation();

  // Ignore standalone modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  shortcut = {
    ctrlKey: e.ctrlKey || e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: false,
    key: e.key.toLowerCase()
  };

  renderShortcutDisplay();
  checkShortcutConflicts();
  saveShortcut();

  isRecording = false;
  shortcutCapture.classList.remove('recording');
  shortcutCapture.blur();
  statusBar.textContent = 'Atalho atualizado.';
});

// ── Shortcut status ────────────────────────────────────────
function updateShortcutStatus() {
  const msgs = getMessages();
  const cIdx = activeGroup().currentIndex;
  if (msgs.length === 0) {
    statusIndex.textContent = 'Nenhuma mensagem';
    btnCopyNow.disabled = true;
  } else {
    statusIndex.textContent = `Mensagem ${cIdx + 1} de ${msgs.length}`;
    btnCopyNow.disabled = false;
  }
}

// ── Copy now ───────────────────────────────────────────────
btnCopyNow.addEventListener('click', async () => {
  const msgs = getMessages();
  if (msgs.length === 0) return;

  const idx = activeGroup().currentIndex;
  const msg = msgs[idx];

  try {
    await navigator.clipboard.writeText(msg);

    highlightMessageItem(idx);

    copyToast.style.display = 'block';
    copyToast.textContent = `Copiada: Mensagem ${idx + 1} de ${msgs.length}`;
    setTimeout(() => { copyToast.style.display = 'none'; }, 2000);

    const newIdx = (idx + 1) % msgs.length;
    groups[activeGroupId].currentIndex = newIdx;
    await saveGroupsNow();
    updateShortcutStatus();
    renderMessageList();

  } catch {
    copyToast.style.display = 'block';
    copyToast.textContent = 'Erro ao copiar.';
    copyToast.style.background = 'rgba(237,73,86,0.15)';
    copyToast.style.color = 'var(--danger)';
    setTimeout(() => {
      copyToast.style.display = 'none';
      copyToast.style.background = 'rgba(120,222,69,0.15)';
      copyToast.style.color = 'var(--success)';
    }, 2000);
  }
});

// ── Storage change listener ────────────────────────────────
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.groups) {
    groups = changes.groups.newValue || {};
    renderMessageList();
    renderGroupSelector();
    updateShortcutStatus();
    toggleClearGenBtn();
  }
  if (changes.activeGroupId) {
    activeGroupId = changes.activeGroupId.newValue;
    renderGroupSelector();
    renderMessageList();
    updateShortcutStatus();
    toggleClearGenBtn();
  }
  if (changes.shortcut) {
    shortcut = changes.shortcut.newValue || { ctrlKey: true, key: 'i' };
    renderShortcutDisplay();
    checkShortcutConflicts();
  }
});

// ── Init ───────────────────────────────────────────────────
loadSettings();
