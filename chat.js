// chat.js — real-time messaging across the dashboard.
// Uses Cloudflare Worker R2 storage (chat:{channelId} JSON arrays) with
// short-polling for updates instead of Firestore onSnapshot.
import { cachedFetchText } from './data-cache.js';

function getChannelId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const CHAT_KEY_PREFIX = 'chat:';
const POLL_INTERVAL = 5000;

const Chat = {
  _pollTimer: null,
  _currentUser: null,
  _selectedUser: null,
  _users: [],
  _unreadCounts: {},
  _lastMessages: {},
  _searchQuery: '',

  async init() {
    const user = window.Auth ? window.Auth.currentUser() : null;
    this._currentUser = user;
    if (!this._currentUser) return;
    this._bindUI();
    try {
      await this._loadUsers();
    } catch (e) {
      console.error('Chat: init load users failed', e);
    }
    this._startPolling();
  },

  _bindUI() {
    const fab = document.getElementById('chatFab');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatPanelClose');
    const backBtn = document.getElementById('chatBackBtn');
    const inputForm = document.getElementById('chatInputForm');
    const input = document.getElementById('chatInput');
    const searchInput = document.getElementById('chatUserSearch');

    if (fab) fab.addEventListener('click', () => this._togglePanel());
    if (closeBtn) closeBtn.addEventListener('click', () => this._togglePanel(false));
    if (backBtn) backBtn.addEventListener('click', () => this._showUserSelect());
    if (inputForm) inputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      this._sendMessage(text);
      input.value = '';
    });
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchQuery = e.target.value.trim().toLowerCase();
        this._renderUserList();
      });
    }
  },

  _togglePanel(forceState) {
    const panel = document.getElementById('chatPanel');
    const fab = document.getElementById('chatFab');
    if (!panel) return;
    const isOpen = forceState !== undefined ? forceState : !panel.classList.contains('open');
    panel.classList.toggle('open', isOpen);
    panel.setAttribute('aria-hidden', !isOpen);
    if (fab) fab.style.transform = isOpen ? 'scale(.9)' : '';
    if (isOpen) {
      this._clearUnread();
      if (this._selectedUser) {
        this._renderMessagesFor(this._selectedUser.uid);
      }
      if (!this._selectedUser && this._users.length > 0) {
        this._renderUserList();
      }
    }
  },

  async _loadUsers() {
    const list = document.getElementById('chatUserList');
    if (!list) return;
    list.innerHTML = '<div class="chat-empty-state">Loading users...</div>';

    try {
      const users = await window.Auth.listAccounts();
      this._users = users.filter(u => u.uid !== this._currentUser?.uid);
      this._renderUserList();
    } catch (e) {
      console.error('Chat: failed to load users', e);
      list.innerHTML = '<div class="chat-empty-state">Failed to load users</div>';
    }
  },

  _renderUserList() {
    const list = document.getElementById('chatUserList');
    if (!list) return;
    const filtered = this._searchQuery
      ? this._users.filter(u =>
          (u.name || '').toLowerCase().includes(this._searchQuery) ||
          (u.email || '').toLowerCase().includes(this._searchQuery)
        )
      : this._users;

    if (filtered.length === 0) {
      list.innerHTML = this._searchQuery
        ? '<div class="chat-empty-state">No users match your search</div>'
        : '<div class="chat-empty-state">No other users available</div>';
      return;
    }

    const sorted = filtered.slice().sort((a, b) => {
      const aUnread = this._unreadCounts[a.uid] || 0;
      const bUnread = this._unreadCounts[b.uid] || 0;
      if (bUnread !== aUnread) return bUnread - aUnread;
      const aTime = this._lastMessages[a.uid]?.timestamp || 0;
      const bTime = this._lastMessages[b.uid]?.timestamp || 0;
      return bTime - aTime;
    });

    list.innerHTML = '';
    sorted.forEach(user => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chat-user-item';
      const unread = this._unreadCounts[user.uid] || 0;
      const lastMsg = this._lastMessages[user.uid];
      const lastText = lastMsg ? this._escapeHtml(lastMsg.text || '') : '';
      item.innerHTML = `
        <div class="chat-user-avatar">${getInitials(user.name || user.email)}</div>
        <div class="chat-user-info">
          <div class="chat-user-name">${escapeHtml(user.name || user.email || 'Unknown')}${unread ? `<span class="chat-unread-badge">${unread}</span>` : ''}</div>
          <div class="chat-user-email">${escapeHtml(user.email || '')}</div>
          ${lastText ? `<div class="chat-user-last">${lastText.slice(0, 40)}${lastText.length > 40 ? '...' : ''}</div>` : ''}
        </div>
      `;
      item.addEventListener('click', () => this._selectUser(user));
      list.appendChild(item);
    });
  },

  _selectUser(user) {
    this._selectedUser = user;
    const userSelect = document.getElementById('chatUserSelect');
    const conversation = document.getElementById('chatConversation');
    const partnerName = document.getElementById('chatPartnerName');
    if (userSelect) userSelect.hidden = true;
    if (conversation) conversation.hidden = false;
    if (partnerName) partnerName.textContent = user.name || user.email || 'Chat';
    this._clearUnreadFor(user.uid);
    this._renderMessagesFor(user.uid);
  },

  _showUserSelect() {
    this._selectedUser = null;
    const userSelect = document.getElementById('chatUserSelect');
    const conversation = document.getElementById('chatConversation');
    if (userSelect) userSelect.hidden = false;
    if (conversation) conversation.hidden = true;
    const messages = document.getElementById('chatMessages');
    if (messages) messages.innerHTML = '';
    this._renderUserList();
  },

  _channelKey(otherUid) {
    return CHAT_KEY_PREFIX + getChannelId(this._currentUser.uid, otherUid);
  },

  async _renderMessagesFor(otherUid) {
    const messagesEl = document.getElementById('chatMessages');
    if (!messagesEl) return;
    messagesEl.innerHTML = '<div class="chat-empty-state">Loading messages...</div>';

    try {
      const messages = await this._loadMessages(otherUid);
      this._renderMessages(messages);
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        this._lastMessages[otherUid] = last;
        if (last.senderId !== this._currentUser.uid) {
          this._incrementUnread(otherUid);
        }
        this._renderUserList();
      }
    } catch (e) {
      console.error('Chat: failed to load messages', e);
      messagesEl.innerHTML = '<div class="chat-empty-state">Failed to load messages.</div>';
    }
  },

  async _loadMessages(otherUid) {
    const key = this._channelKey(otherUid);
    const r = await window.cloudflareAPI.get(key);
    if (!r || !r.value) return [];
    try {
      return JSON.parse(r.value);
    } catch (e) {
      return [];
    }
  },

  _renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (messages.length === 0) {
      container.innerHTML = '<div class="chat-empty-state">No messages yet. Say hello!</div>';
      return;
    }
    container.innerHTML = '';
    const myUid = this._currentUser.uid;
    messages.forEach(msg => {
      const isSent = msg.senderId === myUid;
      const el = document.createElement('div');
      el.className = `chat-message ${isSent ? 'sent' : 'received'}`;
      el.innerHTML = `
        <div>${escapeHtml(msg.text)}</div>
        <div class="chat-message-meta">${formatTime(msg.timestamp)}</div>
      `;
      container.appendChild(el);
    });
    this._scrollToBottom();
  },

  _scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) container.scrollTop = container.scrollHeight;
  },

  _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(async () => {
      if (document.hidden) return;
      if (!this._selectedUser) return;
      try {
        const messages = await this._loadMessages(this._selectedUser.uid);
        const lastKnown = this._lastMessages[this._selectedUser.uid];
        const lastNew = messages[messages.length - 1];
        if (lastNew && lastKnown && lastNew.timestamp !== lastKnown.timestamp) {
          this._renderMessages(messages);
          this._lastMessages[this._selectedUser.uid] = lastNew;
          if (lastNew.senderId !== this._currentUser.uid) {
            this._incrementUnread(this._selectedUser.uid);
          }
          this._renderUserList();
        }
      } catch (e) { /* ignore */ }
    }, POLL_INTERVAL);
  },

  async _sendMessage(text) {
    if (!this._currentUser || !this._selectedUser) return;
    const channelId = getChannelId(this._currentUser.uid, this._selectedUser.uid);
    const key = CHAT_KEY_PREFIX + channelId;
    const message = {
      channelId,
      senderId: this._currentUser.uid,
      receiverId: this._selectedUser.uid,
      text,
      timestamp: new Date().toISOString(),
      senderName: this._currentUser.name || this._currentUser.email
    };

    try {
      const r = await window.cloudflareAPI.get(key);
      let messages = [];
      if (r && r.value) {
        try { messages = JSON.parse(r.value); } catch (e) { messages = []; }
      }
      messages.push(message);
      await window.cloudflareAPI.set(key, JSON.stringify(messages));

      this._lastMessages[this._selectedUser.uid] = {
        text,
        timestamp: Date.now(),
        senderId: this._currentUser.uid
      };
      this._renderUserList();
      this._renderMessagesFor(this._selectedUser.uid);
    } catch (err) {
      console.error('Chat: failed to send message', err);
    }
  },

  _incrementUnread(uid) {
    if (this._selectedUser && this._selectedUser.uid === uid) return;
    this._unreadCounts[uid] = (this._unreadCounts[uid] || 0) + 1;
    this._updateBadge();
  },

  _clearUnreadFor(uid) {
    this._unreadCounts[uid] = 0;
    this._updateBadge();
  },

  _clearUnread() {
    this._unreadCounts = {};
    this._updateBadge();
    this._renderUserList();
  },

  _updateBadge() {
    const total = Object.values(this._unreadCounts).reduce((a, b) => a + b, 0);
    const badge = document.getElementById('chatFabBadge');
    if (badge) {
      badge.textContent = total;
      badge.hidden = total === 0;
    }
  }
};

window.Chat = Chat;
