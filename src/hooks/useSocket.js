'use client';

import { useEffect, useRef, useState } from 'react';
import socketClient from '@/lib/socket/client';
import useUserStore from '@/store/useUserStore';

// --- Main User Socket Hook ---
// Create a singleton socket instance OUTSIDE the component
let globalSocket = null;
let globalToken = null;

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const { user, token } = useUserStore();

  useEffect(() => {
    // ✅ Skip connection if no token or user
    if (!user || !token) {
      // User logged out — disconnect and clear globals
      if (globalSocket) {
        console.log('🔌 useSocket: User/token missing, disconnecting socket');
        globalSocket.disconnect();
        globalSocket = null;
        globalToken = null;
      }
      setIsConnected(false);
      return;
    }

    // ✅ Don't connect during SSR
    if (typeof window === 'undefined') {
      console.log('⚠️ useSocket: Skipping connection during SSR');
      return;
    }

    // ✅ Super admins also need main tenant events (do not skip)

    // Don't reconnect if already connected with same token
    if (globalSocket?.connected && globalToken === token) {
      console.log('🔄 Reusing existing GLOBAL socket:', globalSocket.id);
      setIsConnected(true);
      return;
    }

    // Token changed (different user) — disconnect old socket to prevent cross-user leakage
    if (globalSocket && globalToken !== token) {
      console.log('🔄 useSocket: Token changed, disconnecting old socket');
      globalSocket.disconnect();
      globalSocket = null;
      globalToken = null;
    }

    // Connect main socket
    const socket = socketClient.connect(token);
    if (!socket) {
      console.warn('⚠️ useSocket: Socket connection returned null (likely SSR)');
      return;
    }
    
    globalSocket = socket;
    globalToken = token;

    const handleConnect = () => {
      console.log('✅ useSocket: Socket connected:', socket.id);
      setIsConnected(true);
    };
    
    const handleDisconnect = (reason) => {
      console.log('❌ useSocket: Socket disconnected:', reason);
      setIsConnected(false);
    };
    
    const handleConnectError = (error) => {
      console.error('⚠️ useSocket: Socket connection error:', error.message);
      setIsConnected(false);
    };
    
    const handleReconnect = (attemptNumber) => {
      console.log('🔄 useSocket: Socket reconnecting, attempt:', attemptNumber);
    };
    
    const handleReconnectError = (error) => {
      console.error('⚠️ useSocket: Socket reconnection error:', error.message);
    };

    // ✅ Force logout: when admin deletes this user, immediately log out everywhere
    const handleForceLogout = (data) => {
      console.warn('🔴 Force logout received:', data?.reason || 'Account deleted');
      const { logout } = useUserStore.getState();
      // Clear session and redirect to login
      logout().finally(() => {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('force_logout_reason', data?.reason || 'Your account has been deleted.');
          window.location.href = '/auth/login';
        }
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('reconnect', handleReconnect);
    socket.on('reconnect_error', handleReconnectError);
    socket.on('user:forceLogout', handleForceLogout);

    // Initial state
    setIsConnected(socket.connected);

    // Cleanup on unmount ONLY
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('reconnect', handleReconnect);
      socket.off('reconnect_error', handleReconnectError);
      socket.off('user:forceLogout', handleForceLogout);
    };
  }, [user?.userId, token]);

  // ALWAYS return the global socket
  return {
    socket: globalSocket,
    isConnected,
    emit: (event, data) => {
      if (globalSocket) {
        globalSocket.emit(event, data);
      } else {
        console.warn('⚠️ Cannot emit, socket not connected:', event);
      }
    },
    on: (event, callback) => globalSocket?.on(event, callback),
    off: (event, callback) => globalSocket?.off(event, callback),
  };
}

// --- Hook for listening to specific events ---
export function useSocketEvent(eventName, callback) {
  const { socket } = useSocket();
  const callbackRef = useRef(callback);
  
  // Update callback ref without re-registering listener
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // ✅ Don't register events during SSR
    if (typeof window === 'undefined') {
      return;
    }

    if (!socket) {
      console.warn(`⚠️ useSocketEvent: Socket not available for event: ${eventName}`);
      return;
    }
    
    // Wrapper to use latest callback
    const handler = (...args) => {
      callbackRef.current(...args);
    };

    socket.on(eventName, handler);

    return () => {
      socket.off(eventName, handler);
    };
  }, [socket, eventName]);
}

// --- Super Admin Metrics Hook ---
export function useSuperAdminMetrics() {
  const { user, token } = useUserStore();
  const [metrics, setMetrics] = useState({
    activeSessions: 0,
    messageRate: 0,
    activeConversations: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    // ✅ Only connect for super_admins with valid token
    if (!user || user.role !== 'super_admin' || !token) return;

    console.log('🟢 useSuperAdminMetrics connecting superadmin socket with token:', token);

    const socket = socketClient.connectSuperAdmin(token);
    socketRef.current = socket;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    const handleMetricsUpdate = (data) => setMetrics(data);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('metrics:update', handleMetricsUpdate);

    // Subscribe once connected
    socket.emit('metrics:subscribe');

    // Cleanup on unmount
    return () => {
      socket.emit('metrics:unsubscribe');
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('metrics:update', handleMetricsUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token]);

  return { metrics, isConnected };
}
