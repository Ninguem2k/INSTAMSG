/* global chrome */

// Service worker — minimal: handles cross-context messaging and install.

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings
  chrome.storage.local.get('messages', (result) => {
    if (!result.messages) {
      chrome.storage.local.set({
        messages: [],
        currentIndex: 0,
        baseText: '',
        apiProvider: 'openai',
        apiKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
        temperature: 0.8,
        numVariations: 5,
        language: 'pt'
      });
    }
  });
});

// Relay copy-next requests from popup to active Instagram tab
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
    return true; // async
  }
});
