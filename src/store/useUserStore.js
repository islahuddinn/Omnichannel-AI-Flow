
// src/store/useUserStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../lib/api/client';
import socketClient from '../lib/socket/client';
import { useCallCenterStore } from './useCallCenterStore';

const useUserStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // --- LOGIN FUNCTION ---
      login: async (email, password) => {
        set({ isLoading: true, error: null });

        try {
          const response = await apiClient.post('/auth/login', { email, password });
          const { user } = response.data;

          // ✅ Extract token robustly — handle multiple backend property names
          const accessToken =
            response.data.accessToken ||
            response.data.token ||
            response.data.jwt ||
            null;

          if (!accessToken) {
            throw new Error('No access token returned from server');
          }

          // ✅ Update store
          set({
            user,
            token: accessToken,
            isAuthenticated: true,
            isLoading: false,
          });

          console.log('🟢 User logged in:', user.email);

          // ✅ Connect socket based on role
          if (user.role === 'super_admin') {
            socketClient.connectSuperAdmin(accessToken);
          } else {
            socketClient.connect(accessToken);
          }

          return response.data;
        } catch (error) {
          console.error('Login error:', error);

          set({
            error: error.response?.data?.message || 'Login failed',
            isLoading: false,
          });

          throw error;
        }
      },

      // --- LOGOUT FUNCTION ---
      logout: async () => {
        try {
          await apiClient.post('/auth/logout');
          console.log('✅ Logged out successfully');
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Cleanup SIP connections (unregister extensions and close WebSocket connections)
          try {
            const callCenterStore = useCallCenterStore.getState();
            if (callCenterStore.cleanupSipConnections) {
              await callCenterStore.cleanupSipConnections();
            }
          } catch (sipError) {
            console.error('Error cleaning up SIP connections:', sipError);
          }

          // Disconnect all sockets
          socketClient.disconnect();

          // Mark that user just logged out (for login page message)
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('just_logged_out', 'true');
          }

          // Clear user session
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      // --- UPDATE USER ---
      updateUser: (updates) => {
        set((state) => ({
          user: { ...state.user, ...updates },
        }));
      },

      // --- CLEAR ERROR ---
      clearError: () => set({ error: null }),

      // --- AUTO RECONNECT SOCKET ON APP LOAD ---
      reconnectSocket: () => {
        const { token, user } = get();
        if (!token || !user) return;

        console.log('♻️ Reconnecting socket for user:', user.email);

        if (user.role === 'super_admin') {
          socketClient.connectSuperAdmin(token);
        } else {
          socketClient.connect(token);
        }
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useUserStore;
