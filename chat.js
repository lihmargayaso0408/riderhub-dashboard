// chat.js — real-time messaging across the dashboard.
// Uses Firestore messages collection with onSnapshot listeners.
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
  },

  _bindUI() {
    const fab = document.getElementById('chatFab');
    const panel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('chatPanelClose');
    const backBtn = document.getElementById('chatBackBtn');
    const inputForm = document.getElementById('chatInputForm');
    const input = document.getElementById('chatInput');

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
      this._clearBadge();
      if (this._selectedUser) {
        this._subscribeMessages(this._selectedUser.uid);
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
    if (this._users.length === 0) {
      list.innerHTML = '<div class="chat-empty-state">No other users available</div>';
      return;
    }
    list.innerHTML = '';
    this._users.forEach(user => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chat-user-item';
      item.innerHTML = `
        <div class="chat-user-avatar">${getInitials(user.name || user.email)}</div>
        <div class="chat-user-info">
          <div class="chat-user-name">${user.name || user.email || 'Unknown'}</div>
          <div class="chat-user-email">${user.email || ''}</div>
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
  },

  _subscribeMessages(otherUid) {
    this._unsubscribeMessages();
    const myUid = this._currentUser.uid;
    const channelId = getChannelId(myUid, otherUid);
    const messagesEl = document.getElementById('chatMessages');
    if (messagesEl) messagesEl.innerHTML = '<div class="chat-empty-state">Loading messages...</div>';

    const q = query(
      collection(db, 'messages'),
      where('channelId', '==', channelId),
      orderBy('timestamp', 'asc'),
      limit(200)
    );

    this._unsubMessages = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this._renderMessages(messages);
      this._scrollToBottom();
    }, (err) => {
      console.error('Chat: messages listener error', err);
      if (messagesEl) messagesEl.innerHTML = '<div class="chat-empty-state">Failed to load messages</div>';
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
      await addDoc(collection(db, 'messages'), {
        channelId,
        senderId: this._currentUser.uid,
        receiverId: this._selectedUser.uid,
        text,
        timestamp: serverTimestamp(),
        senderName: this._currentUser.displayName || this._currentUser.email
      });
    } catch (err) {
      console.error('Chat: failed to send message', err);
    }
  },

  _clearBadge() {
    const badge = document.getElementById('chatFabBadge');
    if (badge) { badge.hidden = true; badge.textContent = '0'; }
  }
};

window.Chat = Chat;
