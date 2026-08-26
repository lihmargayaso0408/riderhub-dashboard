// chat.js — real-time messaging across the dashboard.
// Uses Firestore chatMessages collection with onSnapshot listeners.
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
  getDocs, getDoc, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

function getChannelId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
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

const Chat = {
  db, auth,
  _unsubMessages: null,
  _unsubUsers: null,
  _currentUser: null,
  _selectedUser: null,
  _users: [],
  _unreadCounts: {},
  _lastMessages: {},
  _searchQuery: '',

  async init() {
    this._currentUser = auth.currentUser;
    if (!this._currentUser) {
      this._currentUser = await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
      });
    }
    if (!this._currentUser) return;
    this._bindUI();
    this._loadUsers();
    this._setupUnsubListener();
  },

  _setupUnsubListener() {
    window.addEventListener('beforeunload', () => this._unsubscribeMessages());
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
        this._subscribeMessages(this._selectedUser.uid);
      }
      if (!this._selectedUser && this._users.length > 0) {
        this._renderUserList();
      }
    } else {
      this._unsubscribeMessages();
    }
  },

  async _loadUsers() {
    const list = document.getElementById('chatUserList');
    if (!list) return;
    list.innerHTML = '<div class="chat-empty-state">Loading users...</div>';

    try {
      const q = query(
        collection(db, 'users'),
        where('status', '==', 'approved')
      );
      this._unsubUsers = onSnapshot(q, (snapshot) => {
        this._users = snapshot.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.uid !== this._currentUser?.uid);
        this._renderUserList();
      }, (err) => {
        console.error('Chat: failed to load users', err);
        list.innerHTML = '<div class="chat-empty-state">Failed to load users</div>';
      });
    } catch (err) {
      console.error('Chat: error loading users', err);
      list.innerHTML = '<div class="chat-empty-state">Error loading users</div>';
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
          <div class="chat-user-name">${this._escapeHtml(user.name || user.email || 'Unknown')}${unread ? `<span class="chat-unread-badge">${unread}</span>` : ''}</div>
          <div class="chat-user-email">${this._escapeHtml(user.email || '')}</div>
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
    this._subscribeMessages(user.uid);
  },

  _showUserSelect() {
    this._selectedUser = null;
    this._unsubscribeMessages();
    const userSelect = document.getElementById('chatUserSelect');
    const conversation = document.getElementById('chatConversation');
    if (userSelect) userSelect.hidden = false;
    if (conversation) conversation.hidden = true;
    const messages = document.getElementById('chatMessages');
    if (messages) messages.innerHTML = '';
    this._renderUserList();
  },

  _subscribeMessages(otherUid) {
    this._unsubscribeMessages();
    const myUid = this._currentUser.uid;
    const channelId = getChannelId(myUid, otherUid);
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) messagesEl.innerHTML = '<div class="chat-empty-state">Loading messages...</div>';

    const q = query(
      collection(db, 'chatMessages'),
      where('channelId', '==', channelId),
      orderBy('timestamp', 'asc'),
      limit(200)
    );

    this._unsubMessages = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this._renderMessages(messages);
      this._scrollToBottom();
      if (messages.length > 0) {
        const last = messages[messages.length - 1];
        this._lastMessages[otherUid] = last;
        if (last.senderId !== myUid) {
          this._incrementUnread(otherUid);
        }
        this._renderUserList();
      }
    }, (err) => {
      console.error('Chat: messages listener error', err);
      if (messagesEl) messagesEl.innerHTML = '<div class="chat-empty-state">Failed to load messages</div>';
      setTimeout(() => this._subscribeMessages(otherUid), 3000);
    });
  },

  _unsubscribeMessages() {
    if (this._unsubMessages) {
      this._unsubMessages();
      this._unsubMessages = null;
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
        <div>${this._escapeHtml(msg.text)}</div>
        <div class="chat-message-meta">${formatTime(msg.timestamp)}</div>
      `;
      container.appendChild(el);
    });
  },

  _scrollToBottom() {
    const container = document.getElementById('chatMessages');
    if (container) container.scrollTop = container.scrollHeight;
  },

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async _sendMessage(text) {
    if (!this._currentUser || !this._selectedUser) return;
    const channelId = getChannelId(this._currentUser.uid, this._selectedUser.uid);
    try {
      await addDoc(collection(db, 'chatMessages'), {
        channelId,
        senderId: this._currentUser.uid,
        receiverId: this._selectedUser.uid,
        text,
        timestamp: serverTimestamp(),
        senderName: this._currentUser.displayName || this._currentUser.email
      });
      this._lastMessages[this._selectedUser.uid] = {
        text,
        timestamp: Date.now(),
        senderId: this._currentUser.uid
      };
      this._renderUserList();
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
  },

  _clearBadge() {
    this._clearUnread();
  }
};

window.Chat = Chat;
