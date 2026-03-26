'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook to fetch and cache AI bot settings for the current company
 * @returns {Object} { enabled: boolean, baseUrl: string, isLoading: boolean }
 */
export function useAIBotSettings() {
  const { user } = useAuth();
  
  const { data, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const response = await apiClient.get('/companies/current');
      return response.data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    enabled: data?.features?.aiBot?.enabled === true,
    baseUrl: data?.features?.aiBot?.baseUrl || '',
    isLoading
  };
}

