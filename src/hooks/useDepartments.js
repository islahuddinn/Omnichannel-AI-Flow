// src/hooks/useDepartments.js
'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: () => apiClient.get('/departments')
  });
}