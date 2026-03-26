// src/lib/socket/client.js
import { io } from 'socket.io-client';

/**
 * Get the latest auth token from Zustand store.
 * Used as a dynamic getter so Socket.IO reconnections always use a fresh token.
 */
function getLatestToken(fallbackToken) {
  try {
    // Read directly from persisted Zustand store in localStorage
    const stored = localStorage.getItem('user-store');
    if (stored) {
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      if (token) return token;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return fallbackToken;
}

class SocketClient {
  constructor() {
    this.socket = null;
    this.superAdminSocket = null;
    this.lastToken = null;
  }

  // --- Super Admin Socket ---
  connectSuperAdmin(token) {
    if (typeof window === 'undefined') {
      console.warn('⚠️ SuperAdmin socket connection attempted during SSR, skipping...');
      return null;
    }

    if (this.superAdminSocket) this.superAdminSocket.disconnect();

    this.lastToken = token;
    const socketUrl = window.location.origin;
    console.log('🟢 Connecting SuperAdmin socket, URL:', socketUrl);

    this.superAdminSocket = io(`${socketUrl}/superadmin`, {
      path: '/socket.io',
      auth: (cb) => {
        // Dynamic token: always get latest from store on each connection/reconnection
        cb({ token: getLatestToken(token) });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
    });

    this.superAdminSocket.on('connect', () => {
      console.log('✅ SuperAdmin socket connected:', this.superAdminSocket.id);
    });

    this.superAdminSocket.on('connect_error', (err) => {
      console.error('⚠️ SuperAdmin socket connection error:', err.message);
    });

    this.superAdminSocket.on('disconnect', (reason) => {
      console.log('❌ SuperAdmin socket disconnected:', reason);
    });

    return this.superAdminSocket;
  }

  // --- Main User Socket ---
  connect(token) {
    if (typeof window === 'undefined') {
      console.warn('⚠️ Socket connection attempted during SSR, skipping...');
      return null;
    }

    // If already connected with same token, reuse
    if (this.socket && this.socket.connected && this.lastToken === token) {
      console.log('🔄 Reusing existing socket connection:', this.socket.id);
      return this.socket;
    }

    // Disconnect old socket if exists
    if (this.socket) {
      console.log('🔌 Disconnecting old socket before creating new one');
      this.socket.disconnect();
      this.socket = null;
    }

    this.lastToken = token;
    const socketUrl = window.location.origin;
    console.log('🟢 Creating new socket connection, URL:', socketUrl);

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: (cb) => {
        // Dynamic token: always get latest from store on each connection/reconnection
        cb({ token: getLatestToken(token) });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
      upgrade: true,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket.id);
    });

    this.socket.on('connect_error', (err) => {
      console.error('⚠️ Socket connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('⚠️ Socket reconnection error:', error.message);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ Socket reconnection failed - will keep trying');
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.superAdminSocket) {
      this.superAdminSocket.disconnect();
      this.superAdminSocket = null;
    }
    this.lastToken = null;
  }

  getSuperAdminSocket() {
    return this.superAdminSocket;
  }

  getSocket() {
    return this.socket;
  }
}

export default new SocketClient();
