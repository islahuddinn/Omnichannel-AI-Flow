// src/hooks/useChannelStatus.js
'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';

export function useChannelStatus(channelId) {
  return useQuery({
    queryKey: ['channel-status', channelId],
    queryFn: () => apiClient.get(`/channels/${channelId}`),
    enabled: !!channelId,
    refetchInterval: 30000 // Refresh every 30 seconds
  });
}