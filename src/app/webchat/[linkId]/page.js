// src/app/webchat/[linkId]/page.js
/**
 * WebChat Widget Page
 * Dedicated contact link page with PIN authentication
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import WebChatAuthForm from '@/components/webchat/WebChatAuthForm';
import WebChatThemeProvider from '@/components/webchat/WebChatThemeProvider';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Dynamically import WebChatWidget to avoid SSR issues with URL/Howler.js
const WebChatWidget = dynamic(() => import('@/components/webchat/WebChatWidget'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
        <p className="text-gray-600">Loading chat...</p>
      </div>
    </div>
  )
});

export default function WebChatPage() {
  const params = useParams();
  const router = useRouter();
  const linkId = params.linkId;
  const [isMounted, setIsMounted] = useState(false);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState(null);
  const [isFirstTime, setIsFirstTime] = useState(true);

  // Ensure component only renders on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const initializeSocket = useCallback(async (token) => {
    try {
      // Dynamically import socket.io-client only on client side
      if (typeof window === 'undefined') {
        throw new Error('Socket.io-client requires browser environment');
      }
      
      const socketModule = await import('socket.io-client');
      const io = socketModule.io;
      
      // ✅ Always use current origin for dynamic port support
      const socketUrl = window.location.origin;
      
      const newSocket = io(`${socketUrl}/webchat`, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      newSocket.on('connect', () => {
        console.log('✅ WebChat socket connected');
        setSocket(newSocket);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ WebChat socket disconnected');
      });

      newSocket.on('error', (error) => {
        console.error('❌ WebChat socket error:', error);
        setError(error.message || 'Connection error');
      });

      newSocket.on('auth:required', (data) => {
        setIsAuthenticated(false);
        setIsFirstTime(data.isFirstTime || false);
      });

      setSocket(newSocket);
    } catch (error) {
      console.error('Socket initialization error:', error);
      setError('Failed to connect to chat server');
    }
  }, []);

  const handleAuthSuccess = useCallback((authData) => {
    const sessionData = {
      ...authData.session,
      token: authData.token, // ✅ Include token in session object
      companyInfo: authData.companyInfo || authData.session?.companyInfo, // ✅ Include company info
      agentInfo: authData.agentInfo || authData.session?.agentInfo, // ✅ Include agent info
    };
    
    setIsAuthenticated(true);
    setSession(sessionData);
    const wasFirstTime = authData.isFirstTime || false;
    setIsFirstTime(false); // After successful auth, no longer first-time
    
    // ✅ Store in sessionStorage (cleared on tab close - for page refresh scenario)
    const sessionPayload = {
      token: authData.token,
      session: sessionData,
      contact: authData.contact,
      companyInfo: authData.companyInfo,
      agentInfo: authData.agentInfo,
      isFirstTime: false,
    };
    sessionStorage.setItem(`webchat_session_${linkId}`, JSON.stringify(sessionPayload));

    // ✅ Also store in localStorage as a backup — survives cookie/sessionStorage clearing
    // This enables session recovery even when the visitor clears browser data
    localStorage.setItem(`webchat_session_${linkId}`, JSON.stringify(sessionPayload));

    // ✅ If credentials were provided (first-time or new device), mark in localStorage
    // This persists across browser sessions (same device/browser)
    if (wasFirstTime && authData.contact) {
      localStorage.setItem(`webchat_credentials_${linkId}`, 'true');
    }

    // Initialize socket connection
    initializeSocket(authData.token);
  }, [linkId, initializeSocket]);

  // ✅ Handle session update (e.g., clearing stale conversationId when conversation is deleted)
  const handleSessionUpdate = useCallback((updatedFields) => {
    setSession(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updatedFields };
      // Also update both storages
      try {
        const stored = sessionStorage.getItem(`webchat_session_${linkId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.session = { ...parsed.session, ...updatedFields };
          const updatedJson = JSON.stringify(parsed);
          sessionStorage.setItem(`webchat_session_${linkId}`, updatedJson);
          localStorage.setItem(`webchat_session_${linkId}`, updatedJson);
        }
      } catch (e) {
        // Ignore storage errors
      }
      return updated;
    });
  }, [linkId]);

  // ✅ Handle logout - MUST be defined before any conditional returns (Rules of Hooks)
  const handleLogout = useCallback(() => {
    // Disconnect socket
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    // Clear sessionStorage and localStorage
    sessionStorage.removeItem(`webchat_session_${linkId}`);
    localStorage.removeItem(`webchat_session_${linkId}`);
    localStorage.removeItem(`webchat_credentials_${linkId}`);

    // Reset state
    setIsAuthenticated(false);
    setSession(null);
    setIsFirstTime(true);
    setError(null);

    // Show success message
    toast.success('Logged out successfully');
  }, [socket, linkId]);

  // ✅ Extract token from session or localStorage - MUST be defined before conditional returns
  const getToken = useCallback(() => {
    if (session?.token) return session.token;
    try {
      const storedSession = localStorage.getItem(`webchat_session_${linkId}`);
      if (storedSession) {
        const sessionData = JSON.parse(storedSession);
        return sessionData.token;
      }
    } catch (e) {
      // Ignore
    }
    return null;
  }, [session?.token, linkId]);

  // ✅ Smart session management:
  // - sessionStorage: tracks current browser session (cleared on tab close)
  // - localStorage: tracks if credentials were provided (persists across sessions)
  // - Always require PIN on every access
  useEffect(() => {
    if (!isMounted || !linkId) return;
    
    const checkSession = async () => {
      try {
        // ✅ Check sessionStorage for current session (page refresh scenario)
        const currentSession = sessionStorage.getItem(`webchat_session_${linkId}`);
        
        // ✅ Check localStorage for credentials flag (same device/browser scenario)
        const credentialsProvided = localStorage.getItem(`webchat_credentials_${linkId}`);
        
        // ✅ Try sessionStorage first, then localStorage as fallback
        const storedSession = currentSession || localStorage.getItem(`webchat_session_${linkId}`);
        if (storedSession) {
          // Page refresh or session recovery - restore from storage
          try {
            const sessionData = JSON.parse(storedSession);
            setIsAuthenticated(true);
            setSession(sessionData.session);
            setIsFirstTime(sessionData.isFirstTime || false);
            setIsLoading(false);

            // Reinitialize socket
            if (sessionData.token) {
              await initializeSocket(sessionData.token);
            }

            // ✅ Re-populate sessionStorage if it was cleared but localStorage had the data
            if (!currentSession && storedSession) {
              sessionStorage.setItem(`webchat_session_${linkId}`, storedSession);
            }
            return;
          } catch (e) {
            console.error('Error parsing stored session:', e);
          }
        }

        // ✅ No current session - check if credentials were provided before
        // If credentials exist in localStorage, user only needs PIN
        // If not, user needs PIN + credentials (first-time or new device)
        const needsCredentials = !credentialsProvided;
        setIsFirstTime(needsCredentials);
        setIsAuthenticated(false);
        setIsLoading(false);
      } catch (e) {
        console.error('Error checking session storage:', e);
        setIsAuthenticated(false);
        setIsLoading(false);
        setIsFirstTime(true);
      }
    };
    
    checkSession();
  }, [linkId, isMounted, initializeSocket]);

  // Show loading state until mounted
  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (error && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <div className="text-red-600 mb-4 text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <WebChatThemeProvider>
        <WebChatAuthForm
          linkId={linkId}
          isFirstTime={isFirstTime}
          onAuthSuccess={handleAuthSuccess}
          onError={setError}
        />
      </WebChatThemeProvider>
    );
  }

  return (
    <WebChatThemeProvider>
      <WebChatWidget
        socket={socket}
        session={session}
        linkId={linkId}
        isFirstTime={isFirstTime}
        token={getToken()}
        onLogout={handleLogout}
        onSessionUpdate={handleSessionUpdate}
      />
    </WebChatThemeProvider>
  );
}

