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
const generateError = $('#generate-error');
const numLabel = $('#num-label');
const tempLabel = $('#temp-label');

// Messages
const msgList = $('#msg-list');
const msgCount = $('#msg-count');
const btnAddMsg = $('#btn-add-msg');
const btnSave = $('#btn-save');

// Shortcut
const statusIndex = $('#status-index');
const btnCopyNow = $('#btn-copy-now');
const copyToast = $('#copy-toast');

// Shared
const statusBar = $('#status-bar');

// ── State ──────────────────────────────────────────────────
let messages = [];
let currentIndex = 0;

// ── Storage helpers ────────────────────────────────────────
async function loadSettings() {
  const keys = [
    'baseText', 'messages', 'currentIndex',
    'apiProvider', 'apiKey', 'ollamaUrl', 'ollamaModel',
    'temperature', 'numVariations', 'language'
  ];
  const result = await chrome.storage.local.get(keys);
  baseText.value = result.baseText || '';
  messages = result.messages || [];
  currentIndex = result.currentIndex || 0;
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
  renderMessageList();
  updateShortcutStatus();

  // Auto-switch to Messages tab if already configured
  const hasProvider = result.apiProvider === 'ollama' || (result.apiKey && result.apiKey.trim().length > 0);
  const hasMessages = messages.length > 0;
  if (hasProvider && hasMessages) {
    switchTab('messages');
  }
}

function switchTab(tabName) {
  tabs.forEach(t => t.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = document.getElementById(`panel-${tabName}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (panel) panel.classList.add('active');
}

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

// ── Save on input change ───────────────────────────────────
apiKey.addEventListener('change', () => saveSetting('apiKey', apiKey.value));
ollamaUrl.addEventListener('change', () => saveSetting('ollamaUrl', ollamaUrl.value));
ollamaModel.addEventListener('change', () => saveSetting('ollamaModel', ollamaModel.value));
language.addEventListener('change', () => saveSetting('language', language.value));
baseText.addEventListener('blur', () => saveSetting('baseText', baseText.value));

// ── Tabs ───────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ── AI: Prompt builder ─────────────────────────────────────
function buildPrompt(text, n, temp, lang) {
  const langNames = { pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano' };
  return [
    `Gere exatamente ${n} variações diferentes da mensagem abaixo.`,
    `Requisitos:`,
    `- Mantenha o significado e tom geral da mensagem original.`,
    `- Cada variação deve soar natural, como se enviada por uma pessoa real em uma conversa.`,
    `- Varie vocabulário, estrutura das frases, e informalidade.`,
    `- Use o idioma: ${langNames[lang] || lang}.`,
    `- Nível de criatividade: ${temp} (0 = conservador, 2 = muito criativo).`,
    `- Responda APENAS com as ${n} variações, uma por linha, sem numeração, sem aspas, sem texto adicional.`,
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
        { role: 'system', content: 'Você gera variações de mensagens de texto. Responda apenas com as variações solicitadas.' },
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
    throw new Error(err.error || `Erro HTTP ${resp.status} — Ollama está rodando?`);
  }

  const data = await resp.json();
  return data.response || '';
}

// ── Generate action ────────────────────────────────────────
btnGenerate.addEventListener('click', async () => {
  const text = baseText.value.trim();
  if (!text) {
    showError('Digite um texto base primeiro.');
    return;
  }

  const prov = apiProvider.value;
  const key = apiKey.value.trim();
  const n = Number(numVariations.value);
  const temp = Number(temperature.value);
  const lang = language.value;

  if (prov !== 'ollama' && !key) {
    showError('Configure sua chave de API primeiro.');
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.querySelector('.btn-text').textContent = 'Gerando...';
  btnGenerate.querySelector('.spinner').style.display = 'inline-block';
  generateError.style.display = 'none';
  statusBar.textContent = 'Conectando à IA...';

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

    messages = parseResponse(raw, n);

    if (messages.length === 0) {
      throw new Error('Resposta da IA não continha variações válidas. Tente novamente.');
    }

    currentIndex = 0;
    await chrome.storage.local.set({ messages, currentIndex, baseText: text });
    renderMessageList();
    updateShortcutStatus();
    statusBar.textContent = `${messages.length} variações geradas.`;

    // Switch to messages tab
    switchTab('messages');

  } catch (err) {
    showError(err.message);
    statusBar.textContent = 'Erro na geração.';
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.querySelector('.btn-text').textContent = 'Gerar variações com IA';
    btnGenerate.querySelector('.spinner').style.display = 'none';
  }
});

function showError(msg) {
  generateError.textContent = msg;
  generateError.style.display = 'block';
}

// ── Message list rendering ─────────────────────────────────
function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function renderMessageList() {
  msgList.innerHTML = '';
  messages.forEach((msg, i) => {
    const li = document.createElement('li');
    li.className = 'msg-item' + (i === currentIndex ? ' current' : '');
    li.innerHTML = `
      <span class="index">${i + 1}</span>
      <textarea rows="1" data-index="${i}">${escapeHtml(msg)}</textarea>
      <button class="btn-remove" data-index="${i}" title="Remover">&times;</button>
    `;
    msgList.appendChild(li);
  });
  msgCount.textContent = `${messages.length} mensagem${messages.length !== 1 ? 'ns' : ''}`;

  // Init + auto-resize + edit handler
  msgList.querySelectorAll('textarea').forEach(ta => {
    autoResize(ta);
    ta.addEventListener('focus', () => autoResize(ta));
    ta.addEventListener('input', () => {
      const idx = Number(ta.dataset.index);
      messages[idx] = ta.value;
      autoResize(ta);
    });
  });

  // Remove handler
  msgList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      messages.splice(idx, 1);
      if (currentIndex >= messages.length) currentIndex = Math.max(0, messages.length - 1);
      renderMessageList();
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
  messages.push('');
  renderMessageList();
  const last = msgList.querySelector('textarea:last-of-type');
  if (last) last.focus();
});

// ── Save list ──────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  // Sync any unsaved textarea edits
  msgList.querySelectorAll('textarea').forEach(ta => {
    const idx = Number(ta.dataset.index);
    messages[idx] = ta.value;
  });

  // Remove empty messages
  messages = messages.filter(m => m.trim() !== '');
  if (messages.length === 0) {
    statusBar.textContent = 'Adicione pelo menos uma mensagem.';
    return;
  }

  currentIndex = Math.min(currentIndex, messages.length - 1);
  await chrome.storage.local.set({ messages, currentIndex });
  renderMessageList();
  updateShortcutStatus();
  statusBar.textContent = 'Lista salva.';
});

// ── Shortcut status ────────────────────────────────────────
function updateShortcutStatus() {
  if (messages.length === 0) {
    statusIndex.textContent = 'Nenhuma mensagem';
    btnCopyNow.disabled = true;
  } else {
    statusIndex.textContent = `Mensagem ${currentIndex + 1} de ${messages.length}`;
    btnCopyNow.disabled = false;
  }
}

// ── Copy current ───────────────────────────────────────────
btnCopyNow.addEventListener('click', async () => {
  if (messages.length === 0) return;
  const msg = messages[currentIndex];
  try {
    await navigator.clipboard.writeText(msg);
    copyToast.style.display = 'block';
    copyToast.textContent = `Copiada: Mensagem ${currentIndex + 1} de ${messages.length}`;
    setTimeout(() => { copyToast.style.display = 'none'; }, 2000);

    // Advance index
    currentIndex = (currentIndex + 1) % messages.length;
    await chrome.storage.local.set({ currentIndex });
    updateShortcutStatus();
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

// ── Init ───────────────────────────────────────────────────
loadSettings();
