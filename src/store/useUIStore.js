// src/store/useUIStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useUIStore = create(
  persist(
    (set, get) => ({
      // Default theme; will be rehydrated from localStorage if available
      theme: 'light',
      sidebarOpen: true,
      modals: {
        createCompany: false,
        editCompany: false,
        companyDetails: false
      },
      notifications: [],

      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark');
        }
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarOpen: !state.sidebarOpen }));
      },

      openModal: (modalName) => {
        set((state) => ({
          modals: { ...state.modals, [modalName]: true }
        }));
      },

      closeModal: (modalName) => {
        set((state) => ({
          modals: { ...state.modals, [modalName]: false }
        }));
      },

      addNotification: (notification) => {
        const id = Date.now();
        set((state) => ({
          notifications: [...state.notifications, { ...notification, id }]
        }));

        // Auto-remove after 5 seconds
        setTimeout(() => {
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id)
          }));
        }, 5000);
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }));
      }
    }),
    {
      name: 'ui-theme',
      storage: createJSONStorage(() => localStorage),
      // Ensure document class matches the rehydrated theme
      onRehydrateStorage: () => (state) => {
        const theme = state?.theme ?? get().theme;
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark');
        }
      }
    }
  )
);

export default useUIStore;