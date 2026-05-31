/* global chrome */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('_schemaVersion', (result) => {
    if (!result._schemaVersion) {
      chrome.storage.local.set({
        groups: {
          default: { name: 'Geral', messages: [], currentIndex: 0, createdAt: Date.now() }
        },
        activeGroupId: 'default',
        shortcut: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'i' },
        baseText: '',
        apiProvider: 'openai',
        apiKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
        temperature: 0.8,
        numVariations: 5,
        language: 'pt',
        _schemaVersion: 2
      });
    }
  });
});

// Relay copy-next from popup to Instagram content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'copyNextFromPopup') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.includes('instagram.com')) {
        chrome.tabs.sendMessage(tab.id, { action: 'copyNext' }, (response) => {
          sendResponse(response || { ok: false, error: 'no response from content script' });
        });
      } else {
        sendResponse({ ok: false, error: 'not on instagram' });
      }
    });
    return true;
  }
});
