// src/hooks/useConversationMerge.js
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

/**
 * Hook for merging and unmerging conversations
 */
export function useConversationMerge() {
  const queryClient = useQueryClient();

  const mergeMutation = useMutation({
    mutationFn: async ({ conversationId, targetConversationId, reason }) => {
      const response = await apiClient.post(`/conversations/${conversationId}/merge`, {
        targetConversationId,
        reason: reason || 'Manual merge'
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      toast.success('Conversations merged successfully');
      // Invalidate relevant queries
      queryClient.invalidateQueries(['conversations']);
      queryClient.invalidateQueries(['messages-infinite', variables.conversationId]);
      queryClient.invalidateQueries(['messages-infinite', data.data?.primaryConversationId]);
      queryClient.invalidateQueries(['conversation', variables.conversationId]);
      queryClient.invalidateQueries(['conversation', data.data?.primaryConversationId]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to merge conversations');
    }
  });

  const unmergeMutation = useMutation({
    mutationFn: async ({ conversationId, unmergeConversationId }) => {
      if (unmergeConversationId) {
        // Unmerge from primary conversation
        const response = await apiClient.delete(`/conversations/${conversationId}/merge`, {
          data: { unmergeConversationId }
        });
        return response.data;
      } else {
        // Unmerge this conversation from primary
        const response = await apiClient.delete(`/conversations/${conversationId}/merge`);
        return response.data;
      }
    },
    onSuccess: (data, variables) => {
      toast.success('Conversation unmerged successfully');
      // Invalidate relevant queries
      queryClient.invalidateQueries(['conversations']);
      queryClient.invalidateQueries(['messages-infinite', variables.conversationId]);
      if (data.data?.primaryConversationId) {
        queryClient.invalidateQueries(['messages-infinite', data.data.primaryConversationId]);
        queryClient.invalidateQueries(['conversation', data.data.primaryConversationId]);
      }
      queryClient.invalidateQueries(['conversation', variables.conversationId]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to unmerge conversation');
    }
  });

  return {
    mergeConversation: mergeMutation.mutate,
    unmergeConversation: unmergeMutation.mutate,
    isMerging: mergeMutation.isPending,
    isUnmerging: unmergeMutation.isPending
  };
}

