// src/hooks/useUsers.js
'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export function useUsers(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => apiClient.get(`/users?${queryString}`)
  });
}