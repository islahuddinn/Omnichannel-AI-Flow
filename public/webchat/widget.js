/**
 * OmniConnect WebChat Widget
 * Embeddable real-time chat widget for websites
 * 
 * Usage:
 * <script src="https://your-domain.com/webchat/widget.js" 
 *         data-widget-id="widget_abc123"
 *         data-position="bottom-right">
 * </script>
 */

(function() {
  'use strict';

  // Widget Configuration
  const script = document.currentScript;
  const config = {
    widgetId: script.getAttribute('data-widget-id'),
    position: script.getAttribute('data-position') || 'bottom-right',
    primaryColor: script.getAttribute('data-color') || '#4f46e5',
    greeting: script.getAttribute('data-greeting') || 'Hi! How can we help?',
    title: script.getAttribute('data-title') || 'Chat with us',
    apiUrl: script.getAttribute('data-api-url') || window.location.origin,
    socketUrl: script.getAttribute('data-socket-url') || window.location.origin,
  };

  // Validate widget ID
  if (!config.widgetId) {
    console.error('OmniConnect: widget-id is required');
    return;
  }

  // Widget State
  let state = {
    isOpen: false,
    isMinimized: false,
    isConnected: false,
    session: null,
    messages: [],
    unreadCount: 0,
    agentTyping: false,
  };

  // Socket.IO instance
  let socket = null;

  // DOM Elements
  let widgetContainer = null;
  let chatWindow = null;
  let messagesContainer = null;
  let inputField = null;

  /**
   * Initialize Widget
   */
  function init() {
    // Check if already initialized
    if (document.getElementById('omniconnect-widget')) {
      console.warn('OmniConnect: Widget already initialized');
      return;
    }

    // Load session from localStorage
    loadSession();

    // Create widget UI
    createWidgetUI();

    // Initialize Socket.IO
    initializeSocket();

    // Track visitor
    trackVisitor();

    console.log('✅ OmniConnect Widget initialized');
  }

  /**
   * Load session from localStorage
   */
  function loadSession() {
    try {
      const stored = localStorage.getItem('omniconnect_session');
      if (stored) {
        state.session = JSON.parse(stored);
        
        // Check if session is still valid (30 days)
        const sessionAge = Date.now() - new Date(state.session.createdAt).getTime();
        if (sessionAge > 30 * 24 * 60 * 60 * 1000) {
          // Session expired
          localStorage.removeItem('omniconnect_session');
          state.session = null;
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }

  /**
   * Save session to localStorage
   */
  function saveSession(session) {
    try {
      state.session = session;
      localStorage.setItem('omniconnect_session', JSON.stringify(session));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  /**
   * Create Widget UI
   */
  function createWidgetUI() {
    // Create container
    widgetContainer = document.createElement('div');
    widgetContainer.id = 'omniconnect-widget';
    widgetContainer.className = `omniconnect-widget ${config.position}`;

    // Inject styles
    injectStyles();

    // Create chat button
    const chatButton = createChatButton();
    widgetContainer.appendChild(chatButton);

    // Create chat window
    chatWindow = createChatWindow();
    widgetContainer.appendChild(chatWindow);

    // Add to DOM
    document.body.appendChild(widgetContainer);

    // Event listeners
    chatButton.addEventListener('click', toggleChat);
  }

  /**
   * Inject Widget Styles
   */
  function injectStyles() {
    const styles = `
      #omniconnect-widget {
        position: fixed;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      #omniconnect-widget.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      #omniconnect-widget.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      #omniconnect-widget.top-right {
        top: 20px;
        right: 20px;
      }
      #omniconnect-widget.top-left {
        top: 20px;
        left: 20px;
      }
      .omni-chat-button {
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: ${config.primaryColor};
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .omni-chat-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }
      .omni-chat-button svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      .omni-unread-badge {
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ef4444;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: bold;
      }
      .omni-chat-window {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s ease;
      }
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .omni-chat-window.open {
        display: flex;
      }
      .omni-chat-header {
        background: ${config.primaryColor};
        color: white;
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .omni-chat-header-title {
        font-size: 16px;
        font-weight: 600;
      }
      .omni-chat-header-subtitle {
        font-size: 12px;
        opacity: 0.9;
        margin-top: 2px;
      }
      .omni-close-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
      }
      .omni-messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #f9fafb;
      }
      .omni-message {
        margin-bottom: 12px;
        display: flex;
        align-items: flex-end;
      }
      .omni-message.outbound {
        flex-direction: row-reverse;
      }
      .omni-message-bubble {
        max-width: 70%;
        padding: 10px 14px;
        border-radius: 18px;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
      }
      .omni-message.inbound .omni-message-bubble {
        background: white;
        color: #1f2937;
        border-bottom-left-radius: 4px;
      }
      .omni-message.outbound .omni-message-bubble {
        background: ${config.primaryColor};
        color: white;
        border-bottom-right-radius: 4px;
      }
      .omni-message-time {
        font-size: 11px;
        color: #9ca3af;
        margin-top: 4px;
        padding: 0 8px;
      }
      .omni-typing-indicator {
        display: none;
        padding: 10px 14px;
        background: white;
        border-radius: 18px;
        width: fit-content;
      }
      .omni-typing-indicator.active {
        display: block;
      }
      .omni-typing-dots {
        display: flex;
        gap: 4px;
      }
      .omni-typing-dots span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #9ca3af;
        animation: typing 1.4s infinite;
      }
      .omni-typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      .omni-typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-10px); }
      }
      .omni-input-container {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }
      .omni-input {
        flex: 1;
        border: 1px solid #d1d5db;
        border-radius: 20px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        resize: none;
        max-height: 100px;
      }
      .omni-input:focus {
        border-color: ${config.primaryColor};
      }
      .omni-send-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: ${config.primaryColor};
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      }
      .omni-send-btn:hover {
        transform: scale(1.05);
      }
      .omni-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .omni-send-btn svg {
        width: 20px;
        height: 20px;
        fill: white;
      }
      .omni-greeting {
        text-align: center;
        padding: 24px;
        color: #6b7280;
      }
      .omni-greeting-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        margin-bottom: 8px;
      }
      @media (max-width: 480px) {
        .omni-chat-window {
          width: calc(100vw - 40px);
          height: calc(100vh - 100px);
          bottom: 80px;
        }
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  /**
   * Create Chat Button
   */
  function createChatButton() {
    const button = document.createElement('button');
    button.className = 'omni-chat-button';
    button.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
      </svg>
    `;

    // Add unread badge if needed
    if (state.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'omni-unread-badge';
      badge.textContent = state.unreadCount;
      button.appendChild(badge);
    }

    return button;
  }

  /**
   * Create Chat Window
   */
  function createChatWindow() {
    const window = document.createElement('div');
    window.className = 'omni-chat-window';

    // Header
    const header = document.createElement('div');
    header.className = 'omni-chat-header';
    header.innerHTML = `
      <div>
        <div class="omni-chat-header-title">${config.title}</div>
        <div class="omni-chat-header-subtitle">We'll reply as soon as we can</div>
      </div>
      <button class="omni-close-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    `;
    window.appendChild(header);

    // Messages container
    messagesContainer = document.createElement('div');
    messagesContainer.className = 'omni-messages-container';
    
    // Greeting message
    if (state.messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="omni-greeting">
          <div class="omni-greeting-title">👋 ${config.greeting}</div>
          <div>Send us a message and we'll get back to you shortly.</div>
        </div>
      `;
    }

    window.appendChild(messagesContainer);

    // Typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'omni-typing-indicator';
    typingIndicator.innerHTML = `
      <div class="omni-typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    messagesContainer.appendChild(typingIndicator);

    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'omni-input-container';

    inputField = document.createElement('textarea');
    inputField.className = 'omni-input';
    inputField.placeholder = 'Type your message...';
    inputField.rows = 1;

    const sendButton = document.createElement('button');
    sendButton.className = 'omni-send-btn';
    sendButton.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    `;

    inputContainer.appendChild(inputField);
    inputContainer.appendChild(sendButton);
    window.appendChild(inputContainer);

    // Event listeners
    header.querySelector('.omni-close-btn').addEventListener('click', toggleChat);
    sendButton.addEventListener('click', sendMessage);
    inputField.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    return window;
  }

  /**
   * Toggle Chat Window
   */
  function toggleChat() {
    state.isOpen = !state.isOpen;
    chatWindow.classList.toggle('open', state.isOpen);

    if (state.isOpen) {
      state.unreadCount = 0;
      updateUnreadBadge();
      inputField.focus();
      
      // Connect socket if not connected
      if (!state.isConnected) {
        connectSocket();
      }
    }
  }

  /**
   * Initialize Socket.IO
   */
  function initializeSocket() {
    // Load Socket.IO library
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    script.onload = () => {
      console.log('Socket.IO loaded');
    };
    document.head.appendChild(script);
  }

  /**
   * Connect Socket
   */
  function connectSocket() {
    if (!window.io) {
      setTimeout(connectSocket, 100);
      return;
    }

    // Initialize session if needed
    if (!state.session) {
      initializeSession().then(() => {
        actuallyConnectSocket();
      });
    } else {
      actuallyConnectSocket();
    }
  }

  /**
   * Actually connect to Socket.IO
   */
  function actuallyConnectSocket() {
    socket = io(config.socketUrl + '/webchat', {
      auth: {
        token: state.session.token,
      },
    });

    socket.on('connect', () => {
      console.log('✅ Connected to chat');
      state.isConnected = true;
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from chat');
      state.isConnected = false;
    });

    socket.on('message:receive', (message) => {
      receiveMessage(message);
    });

    socket.on('agent:typing', (data) => {
      showTypingIndicator(data.isTyping);
    });

    socket.on('chat:assigned', (data) => {
      showSystemMessage(`${data.agent.name} joined the chat`);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  /**
   * Initialize Session
   */
  async function initializeSession() {
    try {
      const response = await fetch(`${config.apiUrl}/api/webchat/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          widgetId: config.widgetId,
          metadata: {
            userAgent: navigator.userAgent,
            referrer: document.referrer,
            page: window.location.href,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        saveSession(data.data.session);
        console.log('✅ Session initialized');
      }
    } catch (error) {
      console.error('Failed to initialize session:', error);
    }
  }

  /**
   * Send Message
   */
  function sendMessage() {
    const text = inputField.value.trim();
    
    if (!text || !socket || !state.isConnected) {
      return;
    }

    // Add message to UI
    addMessage({
      text,
      direction: 'outbound',
      timestamp: new Date().toISOString(),
    });

    // Send via socket
    socket.emit('message:send', {
      sessionId: state.session.sessionId,
      content: {
        type: 'text',
        text,
      },
    });

    // Clear input
    inputField.value = '';
    inputField.style.height = 'auto';
  }

  /**
   * Receive Message
   */
  function receiveMessage(message) {
    addMessage({
      text: message.text,
      direction: 'inbound',
      timestamp: message.timestamp,
      sender: message.sender,
    });

    // Increment unread if chat closed
    if (!state.isOpen) {
      state.unreadCount++;
      updateUnreadBadge();
    }
  }

  /**
   * Add Message to UI
   */
  function addMessage(message) {
    state.messages.push(message);

    const messageDiv = document.createElement('div');
    messageDiv.className = `omni-message ${message.direction}`;

    const bubble = document.createElement('div');
    bubble.className = 'omni-message-bubble';
    bubble.textContent = message.text;

    messageDiv.appendChild(bubble);
    
    // Remove greeting if first message
    const greeting = messagesContainer.querySelector('.omni-greeting');
    if (greeting) {
      greeting.remove();
    }

    // Insert before typing indicator
    const typingIndicator = messagesContainer.querySelector('.omni-typing-indicator');
    messagesContainer.insertBefore(messageDiv, typingIndicator);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Show System Message
   */
  function showSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.style.textAlign = 'center';
    messageDiv.style.fontSize = '12px';
    messageDiv.style.color = '#9ca3af';
    messageDiv.style.margin = '12px 0';
    messageDiv.textContent = text;

    const typingIndicator = messagesContainer.querySelector('.omni-typing-indicator');
    messagesContainer.insertBefore(messageDiv, typingIndicator);
  }

  /**
   * Show Typing Indicator
   */
  function showTypingIndicator(isTyping) {
    const indicator = messagesContainer.querySelector('.omni-typing-indicator');
    indicator.classList.toggle('active', isTyping);
    
    if (isTyping) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  /**
   * Update Unread Badge
   */
  function updateUnreadBadge() {
    const button = widgetContainer.querySelector('.omni-chat-button');
    let badge = button.querySelector('.omni-unread-badge');

    if (state.unreadCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'omni-unread-badge';
        button.appendChild(badge);
      }
      badge.textContent = state.unreadCount;
    } else if (badge) {
      badge.remove();
    }
  }

  /**
   * Track Visitor
   */
  function trackVisitor() {
    // Track page views, time on site, etc.
    // This is a placeholder for analytics integration
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.OmniConnect = {
    open: () => {
      if (!state.isOpen) toggleChat();
    },
    close: () => {
      if (state.isOpen) toggleChat();
    },
    sendMessage: (text) => {
      inputField.value = text;
      sendMessage();
    },
  };

})();