// src/store/useEmployeeStatusStore.js
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * Employee Status Store - Manages call and message status
 * Migrated from Jotai atoms to Zustand
 */
export const useEmployeeStatusStore = create(
  devtools(
    persist(
      (set, get) => ({
        // Status state
        callStatus: 'available',
        messageStatus: 'available',
        statusLoading: false,
        
        // Actions
        setCallStatus: (status) => {
          set({ callStatus: status });
          // Also update localStorage for backward compatibility
          if (typeof window !== 'undefined') {
            localStorage.setItem('callStatus', status);
          }
        },
        
        setMessageStatus: (status) => {
          set({ messageStatus: status });
          // Also update localStorage for backward compatibility
          if (typeof window !== 'undefined') {
            localStorage.setItem('messageStatus', status);
          }
        },
        
        setStatusLoading: (loading) => set({ statusLoading: loading }),
        
        // Helper to format status (normalize capitalization)
        formatStatus: (status) => {
          if (!status) return 'available';
          const normalized = status.toLowerCase();
          const validStatuses = ['available', 'occupied', 'notavailable', 'offline', 'outbound', 'viewonly'];
          return validStatuses.includes(normalized) ? normalized : 'available';
        },
      }),
      {
        name: 'EmployeeStatusStore',
        partialize: (state) => ({
          callStatus: state.callStatus,
          messageStatus: state.messageStatus,
        }),
      }
    ),
    { name: 'EmployeeStatusStore' }
  )
);
