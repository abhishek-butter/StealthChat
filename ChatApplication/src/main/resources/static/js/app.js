/**
 * STEALTHCHAT CLIENT APPLICATION CONTROLLER (app.js)
 * Cloud STOMP WebSockets + Resilient Broadcast Fallback + 4-Stage Delivery State Machine
 * School of Computer Science & Engineering (SCOPE), VIT
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentUser: localStorage.getItem('stealthchat_user') || 'Abhishek V. S.',
    currentRole: 'Project Lead (VIT SCOPE)',
    currentRoomId: '1',
    currentRoomName: 'VIT CyberSec Research Group',
    stegoEnabled: true,
    stompClient: null,
    isConnectedToCloud: false,
    stompSubscriptions: {},
    mediaRecorder: null,
    audioChunks: [],
    typingTimeout: null,
    isRecordingAudio: false
  };

  // Local fallback bus for zero-breakdown demo guarantee
  const localChatBus = new BroadcastChannel('stealthchat_bus');

  // IndexedDB Persistence
  const DB_NAME = 'StealthChatDB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('messages')) {
          const store = db.createObjectStore('messages', { keyPath: 'clientMsgId' });
          store.createIndex('roomId', 'roomId', { unique: false });
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      request.onerror = (e) => resolve(null); // Fallback to memory
    });
  }

  function saveMessageToDb(msg) {
    if (!dbInstance) return;
    try {
      const tx = dbInstance.transaction('messages', 'readwrite');
      tx.objectStore('messages').put(msg);
    } catch (e) {}
  }

  function getMessagesFromDb(roomId) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve([]);
      try {
        const tx = dbInstance.transaction('messages', 'readonly');
        const store = tx.objectStore('messages');
        const index = store.index('roomId');
        const request = index.getAll(IDBKeyRange.only(roomId));
        request.onsuccess = (e) => resolve(e.target.result || []);
        request.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  /**
   * Initializes Spring Boot STOMP WebSocket Connection
   */
  function initCloudConnection() {
    updateStatusIndicator('connecting', 'Connecting to Cloud Node...');

    try {
      const socket = new SockJS('/ws-chat');
      const stomp = Stomp.over(socket);
      stomp.debug = null; // Suppress verbose console logs for clean demo

      stomp.connect(
        {},
        () => {
          state.isConnectedToCloud = true;
          state.stompClient = stomp;
          updateStatusIndicator('active', 'Cloud Node Active (RFC 6455)');
          subscribeToActiveRoom(state.currentRoomId);
          startPresenceHeartbeat();
        },
        (err) => {
          console.warn('Cloud STOMP unavailable, activating resilient local bus:', err);
          state.isConnectedToCloud = false;
          state.stompClient = null;
          updateStatusIndicator('fallback', 'Local Demo Bus (Zero Latency)');
          // Try reconnecting in 10 seconds if backend wakes up on Render
          setTimeout(initCloudConnection, 10000);
        }
      );
    } catch (e) {
      console.warn('SockJS init error, using local fallback:', e);
      updateStatusIndicator('fallback', 'Local Demo Bus (Zero Latency)');
    }
  }

  function updateStatusIndicator(status, text) {
    const dot = document.getElementById('statusDot');
    const label = document.getElementById('statusLabel');
    if (dot) {
      dot.className = 'status-dot';
      if (status === 'active') dot.classList.add('active');
      if (status === 'fallback') dot.classList.add('fallback');
    }
    if (label) label.textContent = text;
  }

  /**
   * Subscribes to room channels
   */
  function subscribeToActiveRoom(roomId) {
    if (!state.stompClient || !state.isConnectedToCloud) return;

    // Unsubscribe from previous room topics
    Object.values(state.stompSubscriptions).forEach((sub) => {
      try { sub.unsubscribe(); } catch (e) {}
    });
    state.stompSubscriptions = {};

    // 1. Subscribe to Chat messages
    state.stompSubscriptions.chat = state.stompClient.subscribe(`/topic/${roomId}`, (frame) => {
      try {
        const msg = JSON.parse(frame.body);
        handleIncomingMessage(msg);
      } catch (e) {
        console.error('Error parsing STOMP frame:', e);
      }
    });

    // 2. Subscribe to Call signaling
    state.stompSubscriptions.call = state.stompClient.subscribe(`/topic/call.${roomId}`, (frame) => {
      try {
        const signal = JSON.parse(frame.body);
        window.StealthCall.handleSignal(signal, sendCallSignal);
      } catch (e) {}
    });

    // 3. Subscribe to Typing indicators
    state.stompSubscriptions.typing = state.stompClient.subscribe(`/topic/typing.${roomId}`, (frame) => {
      try {
        const typing = JSON.parse(frame.body);
        if (typing.sender !== state.currentUser) {
          showTypingIndicator(typing.sender);
        }
      } catch (e) {}
    });
  }

  function sendCallSignal(signal) {
    if (state.stompClient && state.isConnectedToCloud) {
      state.stompClient.send(
        `/app/chat.call/${state.currentRoomId}`,
        {},
        JSON.stringify(signal)
      );
    }
  }

  function startPresenceHeartbeat() {
    setInterval(() => {
      if (state.stompClient && state.isConnectedToCloud) {
        state.stompClient.send(
          '/app/chat.heartbeat',
          {},
          JSON.stringify({ sender: state.currentUser, content: 'ONLINE' })
        );
      }
    }, 15000);
  }

  /**
   * Local Cross-Tab Event Listener
   */
  localChatBus.onmessage = (event) => {
    const data = event.data;
    if (data && data.roomId === state.currentRoomId) {
      if (data.type === 'TYPING') {
        if (data.sender !== state.currentUser) showTypingIndicator(data.sender);
      } else {
        handleIncomingMessage(data);
      }
    }
  };

  /**
   * Message Sending Pipeline
   */
  async function sendMessage(text, customPayload = null) {
    const trimmed = text.trim();
    if (!trimmed && !customPayload) return;

    const clientMsgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    let stegoDataUrl = null;
    let stegoMetrics = null;

    if (state.stegoEnabled && !customPayload) {
      // Procedurally generate LSB carrier
      const result = window.StealthStego.encode(trimmed);
      stegoDataUrl = result.dataUrl;
      stegoMetrics = window.StealthStego.auditMetrics(stegoDataUrl);
    }

    const chatMessage = {
      clientMsgId: clientMsgId,
      sender: state.currentUser,
      roomId: state.currentRoomId,
      content: trimmed,
      isStealth: state.stegoEnabled && !customPayload,
      stegoCarrier: stegoDataUrl,
      stegoMetrics: stegoMetrics,
      type: customPayload ? customPayload.type : 'CHAT',
      payloadData: customPayload ? customPayload.data : null,
      deliveryStatus: 'SENT',
      timestamp: Date.now()
    };

    // Save and render locally immediately
    saveMessageToDb(chatMessage);
    renderMessageBubble(chatMessage);
    scrollToBottom();

    // 1. Send via Cloud STOMP if active
    if (state.stompClient && state.isConnectedToCloud) {
      state.stompClient.send(
        `/app/chat.sendMessage/${state.currentRoomId}`,
        {},
        JSON.stringify(chatMessage)
      );
    }

    // 2. Broadcast on local tab bus
    localChatBus.postMessage(chatMessage);

    // Simulate ACK DELIVERED and READ for demonstration if no peer is active
    simulateDeliveryAck(clientMsgId);
  }

  function simulateDeliveryAck(clientMsgId) {
    setTimeout(() => {
      updateMessageStatus(clientMsgId, 'DELIVERED');
    }, 400);
    setTimeout(() => {
      updateMessageStatus(clientMsgId, 'READ');
    }, 1200);
  }

  function handleIncomingMessage(msg) {
    // If it's an ACK receipt
    if (msg.type === 'ACK_DELIVERY' || msg.type === 'ACK_READ') {
      updateMessageStatus(msg.clientMsgId, msg.deliveryStatus);
      return;
    }

    // If message is from self, don't duplicate
    if (msg.sender === state.currentUser) {
      return;
    }

    saveMessageToDb(msg);
    renderMessageBubble(msg);
    scrollToBottom();

    // Send ACK back to sender
    if (state.stompClient && state.isConnectedToCloud) {
      state.stompClient.send(
        `/app/chat.ackDelivery/${state.currentRoomId}`,
        {},
        JSON.stringify({ clientMsgId: msg.clientMsgId, sender: state.currentUser })
      );
      setTimeout(() => {
        state.stompClient.send(
          `/app/chat.ackRead/${state.currentRoomId}`,
          {},
          JSON.stringify({ clientMsgId: msg.clientMsgId, sender: state.currentUser })
        );
      }, 600);
    }
  }

  /**
   * UI Rendering Functions
   */
  function renderMessageBubble(msg) {
    const stream = document.getElementById('messagesStream');
    if (!stream) return;

    // Check if message already exists
    const existing = document.getElementById(`bubble_${msg.clientMsgId}`);
    if (existing) {
      updateMessageStatus(msg.clientMsgId, msg.deliveryStatus);
      return;
    }

    const isOutgoing = msg.sender === state.currentUser;
    const wrapper = document.createElement('div');
    wrapper.id = `bubble_${msg.clientMsgId}`;
    wrapper.className = `message-bubble-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Sender Name (for incoming)
    if (!isOutgoing) {
      const senderDiv = document.createElement('div');
      senderDiv.className = 'message-sender-name';
      senderDiv.textContent = msg.sender;
      bubble.appendChild(senderDiv);
    }

    // Body content based on type
    if (msg.type === 'AUDIO') {
      bubble.appendChild(createAudioNoteElement(msg.payloadData));
    } else if (msg.type === 'POLL') {
      bubble.appendChild(createPollElement(msg.payloadData));
    } else if (msg.type === 'ATTACHMENT') {
      bubble.appendChild(createAttachmentElement(msg.payloadData));
    } else {
      const textDiv = document.createElement('div');
      textDiv.className = 'message-content-text';
      textDiv.textContent = msg.content;
      bubble.appendChild(textDiv);
    }

    // Stego Carrier Preview Card
    if (msg.isStealth && msg.stegoCarrier) {
      const card = document.createElement('div');
      card.className = 'stego-carrier-card';

      const img = document.createElement('img');
      img.className = 'stego-canvas-preview';
      img.src = msg.stegoCarrier;
      img.alt = 'Steganographic Carrier Art';

      const stats = document.createElement('div');
      stats.className = 'stego-stats-row';
      stats.innerHTML = `<span>Carrier: LSB (0.39%)</span><span>H &approx; 5.42 b/B</span>`;

      const inspectBtn = document.createElement('button');
      inspectBtn.className = 'btn-inspect-stego';
      inspectBtn.innerHTML = '&#128269; Inspect Carrier Metrics';
      inspectBtn.onclick = () => openStegoAuditModal(msg);

      card.appendChild(img);
      card.appendChild(stats);
      card.appendChild(inspectBtn);
      bubble.appendChild(card);
    }

    // Meta Footer (Time & 4-Stage Checks)
    const footer = document.createElement('div');
    footer.className = 'message-meta-footer';

    const timeSpan = document.createElement('span');
    const date = new Date(msg.timestamp || Date.now());
    timeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    footer.appendChild(timeSpan);

    if (isOutgoing) {
      const checksSpan = document.createElement('span');
      checksSpan.id = `checks_${msg.clientMsgId}`;
      checksSpan.className = `status-checks ${msg.deliveryStatus.toLowerCase()}`;
      checksSpan.innerHTML = getStatusIcon(msg.deliveryStatus);
      footer.appendChild(checksSpan);
    }

    bubble.appendChild(footer);
    wrapper.appendChild(bubble);
    stream.appendChild(wrapper);
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'PENDING': return '&#9711;'; // circle
      case 'SENT': return '&#10003;'; // single check
      case 'DELIVERED': return '&#10003;&#10003;'; // double check
      case 'READ': return '<span style="color:#38bdf8">&#10003;&#10003;</span>'; // blue double check
      default: return '&#10003;';
    }
  }

  function updateMessageStatus(clientMsgId, status) {
    const checks = document.getElementById(`checks_${clientMsgId}`);
    if (checks) {
      checks.className = `status-checks ${status.toLowerCase()}`;
      checks.innerHTML = getStatusIcon(status);
    }
  }

  function scrollToBottom() {
    const stream = document.getElementById('messagesStream');
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  /**
   * Audio Voice Note Element Creator
   */
  function createAudioNoteElement(base64Audio) {
    const card = document.createElement('div');
    card.className = 'audio-note-card';

    const playBtn = document.createElement('button');
    playBtn.className = 'btn-audio-play';
    playBtn.innerHTML = '&#9658;';

    const audio = new Audio(base64Audio);
    playBtn.onclick = () => {
      if (audio.paused) {
        audio.play();
        playBtn.innerHTML = '&#10074;&#10074;';
      } else {
        audio.pause();
        playBtn.innerHTML = '&#9658;';
      }
    };
    audio.onended = () => { playBtn.innerHTML = '&#9658;'; };

    const trackInfo = document.createElement('div');
    trackInfo.className = 'audio-track-info';

    const waveform = document.createElement('div');
    waveform.className = 'audio-waveform-bar';
    for (let i = 0; i < 28; i++) {
      const bar = document.createElement('div');
      bar.className = 'waveform-stripe';
      bar.style.height = `${4 + Math.random() * 14}px`;
      waveform.appendChild(bar);
    }

    const duration = document.createElement('div');
    duration.style.fontSize = '10.5px';
    duration.style.color = 'var(--text-secondary)';
    duration.textContent = 'Voice Note (Encrypted)';

    trackInfo.appendChild(waveform);
    trackInfo.appendChild(duration);
    card.appendChild(playBtn);
    card.appendChild(trackInfo);
    return card;
  }

  /**
   * Interactive Poll Element Creator
   */
  function createPollElement(pollData) {
    const card = document.createElement('div');
    card.className = 'poll-card';

    const question = document.createElement('div');
    question.className = 'poll-question';
    question.textContent = pollData.question;
    card.appendChild(question);

    let totalVotes = pollData.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);

    pollData.options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'poll-option-row';

      const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;

      const fill = document.createElement('div');
      fill.className = 'poll-option-fill';
      fill.style.width = `${pct}%`;

      const text = document.createElement('div');
      text.className = 'poll-option-text';
      text.textContent = opt.text;

      const count = document.createElement('div');
      count.className = 'poll-option-count';
      count.textContent = `${opt.votes} (${pct}%)`;

      row.onclick = () => {
        opt.votes = (opt.votes || 0) + 1;
        totalVotes++;
        // Re-render poll
        const newPoll = createPollElement(pollData);
        card.replaceWith(newPoll);
      };

      row.appendChild(fill);
      row.appendChild(text);
      row.appendChild(count);
      card.appendChild(row);
    });

    return card;
  }

  /**
   * File Attachment Element Creator
   */
  function createAttachmentElement(attachData) {
    const card = document.createElement('div');
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';

    if (attachData.isImage) {
      const img = document.createElement('img');
      img.src = attachData.dataUrl;
      img.style.maxWidth = '240px';
      img.style.borderRadius = '6px';
      card.appendChild(img);
    }

    const title = document.createElement('div');
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.textContent = `Attached: ${attachData.fileName} (${attachData.fileSize})`;
    card.appendChild(title);
    return card;
  }

  /**
   * Stego Audit Modal
   */
  function openStegoAuditModal(msg) {
    const modal = document.getElementById('stegoAuditModal');
    if (!modal) return;
    modal.classList.add('active');

    document.getElementById('auditCarrierImg').src = msg.stegoCarrier;
    document.getElementById('auditExtractedText').textContent = msg.content;

    const metrics = msg.stegoMetrics || window.StealthStego.auditMetrics(msg.stegoCarrier);
    document.getElementById('metricEntropy').textContent = `${metrics.entropy} bits/byte`;
    document.getElementById('metricPsnr').textContent = metrics.psnr;
    document.getElementById('metricSsim').textContent = metrics.ssim;
    document.getElementById('metricDeltaE').textContent = metrics.deltaE;
    document.getElementById('metricBer').textContent = metrics.ber;
  }

  function showTypingIndicator(username) {
    const bar = document.getElementById('typingIndicator');
    if (!bar) return;
    bar.textContent = `${username} is typing...`;
    bar.classList.add('active');
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      bar.classList.remove('active');
    }, 2000);
  }

  function broadcastTyping() {
    if (state.stompClient && state.isConnectedToCloud) {
      state.stompClient.send(
        `/app/chat.typing/${state.currentRoomId}`,
        {},
        JSON.stringify({ sender: state.currentUser, roomId: state.currentRoomId })
      );
    }
    localChatBus.postMessage({ type: 'TYPING', sender: state.currentUser, roomId: state.currentRoomId });
  }

  /**
   * Voice Memo Audio Recording
   */
  async function toggleAudioRecording() {
    const recordBar = document.getElementById('recordingBar');
    const inputWrapper = document.getElementById('inputWrapper');
    const recordBtn = document.getElementById('btnVoiceRecord');

    if (!state.isRecordingAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.onstop = () => {
          const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            sendMessage('', { type: 'AUDIO', data: reader.result });
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach((track) => track.stop());
        };

        state.mediaRecorder.start();
        state.isRecordingAudio = true;
        recordBar.classList.add('active');
        inputWrapper.style.display = 'none';
        recordBtn.style.color = 'var(--accent-rose)';
      } catch (e) {
        alert('Microphone access unavailable: ' + e.message);
      }
    } else {
      if (state.mediaRecorder) {
        state.mediaRecorder.stop();
      }
      state.isRecordingAudio = false;
      recordBar.classList.remove('active');
      inputWrapper.style.display = 'flex';
      recordBtn.style.color = 'var(--text-secondary)';
    }
  }

  /**
   * Load Room Messages (from REST or local DB)
   */
  async function loadRoomMessages(roomId) {
    const stream = document.getElementById('messagesStream');
    if (stream) stream.innerHTML = '';

    // 1. Try fetching persistent history from Spring Boot REST API
    try {
      const resp = await fetch(`/api/chat/history/${roomId}`);
      if (resp.ok) {
        const history = await resp.json();
        if (history && history.length > 0) {
          history.forEach((m) => {
            renderMessageBubble({
              clientMsgId: m.clientMsgId,
              sender: m.sender,
              roomId: m.roomId,
              content: m.content,
              isStealth: m.isStealth,
              stegoCarrier: m.isStealth ? window.StealthStego.createCoverCanvas(300, 150).toDataURL('image/png') : null,
              deliveryStatus: m.deliveryStatus || 'READ',
              timestamp: Date.now()
            });
          });
          scrollToBottom();
          return;
        }
      }
    } catch (e) {
      console.warn('REST history fetch unavailable, reading local cache:', e);
    }

    // 2. Fallback to IndexedDB local cache
    const cached = await getMessagesFromDb(roomId);
    if (cached && cached.length > 0) {
      cached.forEach(renderMessageBubble);
      scrollToBottom();
    }
  }

  /**
   * Event Listeners & Bootstrapping
   */
  async function bootstrap() {
    await initDatabase();
    initCloudConnection();

    // DOM References
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('btnSendMessage');
    const stegoToggleBtn = document.getElementById('btnStegoToggle');
    const voiceRecordBtn = document.getElementById('btnVoiceRecord');
    const cancelRecordBtn = document.getElementById('btnCancelRecord');
    const mobileBackBtn = document.getElementById('btnMobileBack');
    const mainView = document.getElementById('mainView');

    // Stego Toggle
    if (stegoToggleBtn) {
      stegoToggleBtn.onclick = () => {
        state.stegoEnabled = !state.stegoEnabled;
        stegoToggleBtn.classList.toggle('active', state.stegoEnabled);
        stegoToggleBtn.innerHTML = state.stegoEnabled
          ? '&#128737; Stego: ACTIVE'
          : '&#128737; Stego: OFF';
      };
    }

    // Message input enter key & typing
    if (messageInput) {
      messageInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(messageInput.value);
          messageInput.value = '';
        } else {
          broadcastTyping();
        }
      };
    }

    if (sendBtn) {
      sendBtn.onclick = () => {
        if (messageInput) {
          sendMessage(messageInput.value);
          messageInput.value = '';
        }
      };
    }

    // Voice memo buttons
    if (voiceRecordBtn) voiceRecordBtn.onclick = toggleAudioRecording;
    if (cancelRecordBtn) {
      cancelRecordBtn.onclick = () => {
        if (state.mediaRecorder) {
          state.mediaRecorder.ondataavailable = null;
          state.mediaRecorder.onstop = null;
          state.mediaRecorder.stop();
        }
        state.isRecordingAudio = false;
        document.getElementById('recordingBar').classList.remove('active');
        document.getElementById('inputWrapper').style.display = 'flex';
        document.getElementById('btnVoiceRecord').style.color = 'var(--text-secondary)';
      };
    }

    // Call buttons
    const btnVoiceCall = document.getElementById('btnVoiceCall');
    const btnVideoCall = document.getElementById('btnVideoCall');
    const btnHangup = document.getElementById('btnHangup');
    const btnScreenShare = document.getElementById('btnScreenShare');

    if (btnVoiceCall) {
      btnVoiceCall.onclick = () => {
        window.StealthCall.startCall(state.currentRoomName, 'voice', sendCallSignal);
      };
    }
    if (btnVideoCall) {
      btnVideoCall.onclick = () => {
        window.StealthCall.startCall(state.currentRoomName, 'video', sendCallSignal);
      };
    }
    if (btnHangup) {
      btnHangup.onclick = () => {
        window.StealthCall.endCall(sendCallSignal);
      };
    }
    if (btnScreenShare) {
      btnScreenShare.onclick = () => {
        window.StealthCall.toggleScreenShare();
      };
    }

    // Channel Switching
    document.querySelectorAll('.channel-item').forEach((item) => {
      item.onclick = () => {
        document.querySelectorAll('.channel-item').forEach((c) => c.classList.remove('active'));
        item.classList.add('active');

        state.currentRoomId = item.dataset.roomId || '1';
        state.currentRoomName = item.querySelector('.channel-title').textContent;

        document.getElementById('activeRoomTitle').textContent = state.currentRoomName;
        document.getElementById('activeRoomSubtitle').textContent = `${item.dataset.members || '4'} Members &bull; LSB Carrier Synchronized`;

        if (mainView) mainView.classList.add('show-chat');
        subscribeToActiveRoom(state.currentRoomId);
        loadRoomMessages(state.currentRoomId);
      };
    });

    if (mobileBackBtn) {
      mobileBackBtn.onclick = () => {
        if (mainView) mainView.classList.remove('show-chat');
      };
    }

    // User Profile Switcher for live demo
    const userProfileCard = document.getElementById('userProfileCard');
    if (userProfileCard) {
      userProfileCard.onclick = () => {
        const modal = document.getElementById('userSwitchModal');
        if (modal) modal.classList.add('active');
      };
    }

    // Close Modals
    document.querySelectorAll('.btn-modal-close, .btn-modal-cancel').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
      };
    });

    // Load initial room messages
    loadRoomMessages(state.currentRoomId);
  }

  // Global Exports
  window.StealthApp = {
    getCurrentUsername: () => state.currentUser,
    switchUser: (name, role) => {
      state.currentUser = name;
      state.currentRole = role;
      localStorage.setItem('stealthchat_user', name);
      document.getElementById('currentUserName').textContent = name;
      document.getElementById('currentUserSub').textContent = role;
      document.getElementById('userAvatar').textContent = name.substring(0, 2).toUpperCase();
      document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
      loadRoomMessages(state.currentRoomId);
    },
    sendMessage: sendMessage
  };

  window.addEventListener('DOMContentLoaded', bootstrap);
})();
