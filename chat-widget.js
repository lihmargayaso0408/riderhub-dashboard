(function () {
  "use strict";

  var CHAT_HTML = '' +
    '<button class="chat-fab" id="chatFab" aria-label="Open chat" type="button">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="chat-fab-badge" id="chatFabBadge" hidden>0</span>' +
    '</button>' +
    '<aside class="chat-panel" id="chatPanel" aria-hidden="true">' +
      '<div class="chat-panel-head">' +
        '<div class="chat-panel-head-title">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          '<h3>Messages</h3>' +
        '</div>' +
        '<button class="chat-panel-close" id="chatPanelClose" type="button" aria-label="Close chat">×</button>' +
      '</div>' +
      '<div class="chat-panel-body" id="chatPanelBody">' +
        '<div class="chat-user-select" id="chatUserSelect">' +
          '<p class="chat-user-select-title">Select a user to start chatting</p>' +
          '<input type="text" class="chat-user-search" id="chatUserSearch" placeholder="Search users..." autocomplete="off">' +
          '<div class="chat-user-list" id="chatUserList"></div>' +
        '</div>' +
        '<div class="chat-conversation" id="chatConversation" hidden>' +
          '<button class="chat-back-btn" id="chatBackBtn" type="button">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
            'Back' +
          '</button>' +
          '<div class="chat-partner-name" id="chatPartnerName"></div>' +
          '<div class="chat-messages" id="chatMessages"></div>' +
          '<form class="chat-input-form" id="chatInputForm">' +
            '<input type="text" class="chat-input" id="chatInput" placeholder="Type a message..." autocomplete="off">' +
            '<button type="submit" class="chat-send-btn" aria-label="Send message">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
            '</button>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</aside>';

  function injectChatHTML() {
    if (document.getElementById('chatFab')) return false;
    var host = document.createElement('div');
    host.innerHTML = CHAT_HTML;
    while (host.firstChild) document.body.appendChild(host.firstChild);
    return true;
  }

  function loadChatModule() {
    return new Promise(function (resolve, reject) {
      if (window.Chat) return resolve();
      if (document.querySelector('script[src*="chat.js"]')) {
        var check = setInterval(function () {
          if (window.Chat) { clearInterval(check); resolve(); }
        }, 50);
        setTimeout(function () { clearInterval(check); reject(new Error('chat.js load timeout')); }, 5000);
        return;
      }
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'chat.js';
      s.onload = function () { if (window.Chat) resolve(); else reject(new Error('chat.js loaded but Chat not found')); };
      s.onerror = function () { reject(new Error('failed to load chat.js')); };
      document.head.appendChild(s);
    });
  }

  function initChat() {
    if (typeof window.Chat !== 'undefined' && window.Chat.init) {
      window.Chat.init();
    }
  }

  function openChatPanel() {
    var panel = document.getElementById('chatPanel');
    if (panel) {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      var fab = document.getElementById('chatFab');
      if (fab) fab.style.transform = 'scale(.9)';
      if (window.Chat && window.Chat._clearUnread) window.Chat._clearUnread();
      if (window.Chat && window.Chat._renderUserList) window.Chat._renderUserList();
    }
  }

  function closeChatPanel() {
    var panel = document.getElementById('chatPanel');
    if (panel) {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      var fab = document.getElementById('chatFab');
      if (fab) fab.style.transform = '';
      if (window.Chat && window.Chat._unsubscribeMessages) window.Chat._unsubscribeMessages();
    }
  }

  function wireChatEvents() {
    var fab = document.getElementById('chatFab');
    var closeBtn = document.getElementById('chatPanelClose');
    if (fab) fab.addEventListener('click', function (e) { e.stopPropagation(); openChatPanel(); });
    if (closeBtn) closeBtn.addEventListener('click', function () { closeChatPanel(); });
  }

  function addDrawerButton() {
    var existing = document.getElementById('optChatBtn');
    if (existing) return;

    var drawerBody = document.getElementById('optSettingsDrawer');
    if (drawerBody) {
      var body = drawerBody.querySelector('.drawer-body');
      if (body) {
        var btn = document.createElement('button');
        btn.className = 'drawer-item';
        btn.id = 'optChatBtn';
        btn.type = 'button';
        btn.innerHTML = '<span class="drawer-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
          '</svg></span>' +
          '<span class="drawer-label">Messages</span>';
        btn.addEventListener('click', function () {
          var drawer = document.getElementById('optSettingsDrawer');
          var backdrop = document.getElementById('optDrawerBackdrop');
          var wheel = document.getElementById('optSettingsToggle');
          if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
          if (backdrop) backdrop.hidden = true;
          if (wheel) wheel.classList.remove('open');
          setTimeout(openChatPanel, 150);
        });
        body.insertBefore(btn, body.firstChild);
      }
    }

    var mainDrawer = document.getElementById('settingsDrawer');
    if (mainDrawer && !document.getElementById('chatDrawerBtn')) {
      var mainBody = mainDrawer.querySelector('.drawer-body');
      if (mainBody) {
        var mbtn = document.createElement('button');
        mbtn.className = 'drawer-item';
        mbtn.id = 'chatDrawerBtn';
        mbtn.type = 'button';
        mbtn.innerHTML = '<span class="drawer-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
          '</svg></span>' +
          '<span class="drawer-label">Messages</span>';
        mbtn.addEventListener('click', function () {
          var drawer = document.getElementById('settingsDrawer');
          var backdrop = document.getElementById('drawerBackdrop');
          var wheel = document.getElementById('settingsToggle');
          if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
          if (backdrop) backdrop.hidden = true;
          if (wheel) wheel.classList.remove('open');
          setTimeout(openChatPanel, 150);
        });
        mainBody.insertBefore(mbtn, mainBody.firstChild);
      }
    }
  }

  function waitForDrawer() {
    return new Promise(function (resolve) {
      if (document.getElementById('optSettingsDrawer') || document.getElementById('settingsDrawer')) {
        addDrawerButton();
        resolve();
        return;
      }
      var observer = new MutationObserver(function () {
        if (document.getElementById('optSettingsDrawer') || document.getElementById('settingsDrawer')) {
          observer.disconnect();
          addDrawerButton();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); resolve(); }, 3000);
    });
  }

  async function start() {
    try {
      injectChatHTML();
      await loadChatModule();
      initChat();
      await waitForDrawer();
    } catch (e) {
      console.error('Chat widget init error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.openChatPanel = openChatPanel;
})();
