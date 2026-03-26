// src/store/useChannelStore.js
import { create } from 'zustand';

export const useChannelStore = create((set) => ({
  channels: [],
  setChannels: (channels) => set({ channels }),
  addChannel: (channel) =>
    set((state) => ({
      channels: [...state.channels, channel]
    })),
  updateChannel: (id, updates) =>
    set((state) => ({
      channels: state.channels.map((channel) =>
        channel._id === id ? { ...channel, ...updates } : channel
      )
    })),
  removeChannel: (id) =>
    set((state) => ({
      channels: state.channels.filter((channel) => channel._id !== id)
    }))
}));