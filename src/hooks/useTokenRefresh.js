// src/hooks/useTokenRefresh.js
'use client';

import { useEffect, useRef } from 'react';
import apiClient from '@/lib/api/client';
import useUserStore from '@/store/useUserStore';

// Refresh token every 6 hours (in milliseconds)
const REFRESH_INTERVAL = 6 * 60 * 60 * 1000;

/**
 * Hook that proactively refreshes the auth token on a timer.
 * This prevents the token from expiring while the user has the app open,
 * ensuring they are never unexpectedly logged out.
 */
export function useTokenRefresh() {
  const intervalRef = useRef(null);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      // Clear interval if user logs out
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    async function refreshToken() {
      try {
        const response = await apiClient.post('/auth/refresh');
        const newAccessToken = response?.data?.accessToken;

        if (newAccessToken) {
          // Update Zustand store with the new token (used by Socket.IO)
          useUserStore.setState({ token: newAccessToken });
        }
      } catch (error) {
        console.warn('⚠️ Proactive token refresh failed:', error.message);
      }
    }

    // Set up periodic refresh
    intervalRef.current = setInterval(refreshToken, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated]);
}
