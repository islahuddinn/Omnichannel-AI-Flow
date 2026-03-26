// src/store/useLoadingStore.js
import { create } from 'zustand';

const useLoadingStore = create((set) => ({
  isLoading: false,
  progress: 0,
  
  startLoading: () => {
    set({ isLoading: true, progress: 0 });
  },
  
  setProgress: (progress) => {
    set({ progress });
  },
  
  finishLoading: () => {
    set({ isLoading: false, progress: 0 });
  },
}));

export default useLoadingStore;
