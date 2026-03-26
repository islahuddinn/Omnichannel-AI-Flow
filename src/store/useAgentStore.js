// src/store/useAgentStore.js
import { create } from 'zustand';

export const useAgentStore = create((set) => ({
  stats: null,
  activeConversations: [],
  setStats: (stats) => set({ stats }),
  setActiveConversations: (conversations) => set({ activeConversations: conversations }),
  updateConversation: (conversationId, updates) =>
    set((state) => ({
      activeConversations: state.activeConversations.map((conv) =>
        conv._id === conversationId ? { ...conv, ...updates } : conv
      )
    }))
}));