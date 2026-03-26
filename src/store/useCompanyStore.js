

// src/store/useCompanyStore.js
import { create } from 'zustand';
import apiClient from '../lib/api/client';

const useCompanyStore = create((set, get) => ({
  companies: [],
  selectedCompany: null,
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  },

  fetchCompanies: async (params = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get('/companies', { params });
      
      set({
        companies: response.data.data.companies, // Updated: API returns { success: true, data: { companies, pagination } }
        pagination: response.data.data.pagination,
        isLoading: false
      });

      return response.data.data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch companies',
        isLoading: false
      });
      throw error;
    }
  },

  createCompany: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post('/companies', data);
      
      set((state) => ({
        companies: [response.data.company, ...state.companies], // Updated: API returns { success: true, data: { company, adminUser } }
        isLoading: false
      }));

      return response.data.data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to create company',
        isLoading: false
      });
      throw error;
    }
  },

  updateCompany: async (companyId, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.put(`/companies/${companyId}`, data); // Assume API supports PUT for update
      
      set((state) => ({
        companies: state.companies.map(c => 
          c.id === companyId ? response.data.data : c // Updated: Use 'id' as per mapped structure
        ),
        selectedCompany: state.selectedCompany?.id === companyId 
          ? response.data.data 
          : state.selectedCompany,
        isLoading: false
      }));

      return response.data.data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to update company',
        isLoading: false
      });
      throw error;
    }
  },

  suspendCompany: async (companyId) => {
    try {
      const response = await apiClient.patch(`/companies/${companyId}/suspend`, {});
      
      set((state) => ({
        companies: state.companies.map(c => 
          c._id === companyId || c.id === companyId ? { ...c, status: 'suspended' } : c
        )
      }));

      return response.data.data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to suspend company'
      });
      throw error;
    }
  },

  activateCompany: async (companyId) => {
    try {
      const response = await apiClient.post(`/companies/${companyId}/activate`, {});
      
      set((state) => ({
        companies: state.companies.map(c => 
          c._id === companyId || c.id === companyId ? { ...c, status: 'active' } : c
        )
      }));

      return response.data.data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to activate company'
      });
      throw error;
    }
  },

  selectCompany: (company) => {
    set({ selectedCompany: company });
  },

  clearError: () => set({ error: null })
}));

export default useCompanyStore;