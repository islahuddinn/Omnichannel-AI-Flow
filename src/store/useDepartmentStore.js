// src/store/useDepartmentStore.js
import { create } from 'zustand';

export const useDepartmentStore = create((set) => ({
  departments: [],
  selectedDepartment: null,
  setDepartments: (departments) => set({ departments }),
  setSelectedDepartment: (department) => set({ selectedDepartment: department }),
  addDepartment: (department) =>
    set((state) => ({
      departments: [...state.departments, department]
    })),
  updateDepartment: (id, updates) =>
    set((state) => ({
      departments: state.departments.map((dept) =>
        dept._id === id ? { ...dept, ...updates } : dept
      )
    })),
  removeDepartment: (id) =>
    set((state) => ({
      departments: state.departments.filter((dept) => dept._id !== id)
    }))
}));