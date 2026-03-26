// src/hooks/useConversationActions.js
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

/**
 * Hook for managing conversation actions
 */
export function useConversationActions(conversationId) {
  const queryClient = useQueryClient();

  // Generic action mutation
  const actionMutation = useMutation({
    mutationFn: async ({ action, data = {} }) => {
      const response = await apiClient.post(`/conversations/${conversationId}/actions`, {
        action,
        data,
      });
      return response;
    },
    onSuccess: (response, variables) => {
      const { action } = variables;
      
      // Invalidate relevant queries
      queryClient.invalidateQueries(['conversations']);
      queryClient.invalidateQueries(['conversation', conversationId]);
      
      // Show success toast
      const actionMessages = {
        pin: 'Conversation pinned',
        unpin: 'Conversation unpinned',
        markRead: 'Conversation marked as read',
        markUnread: 'Conversation marked as unread',
        archive: 'Conversation archived',
        unarchive: 'Conversation unarchived',
        // mute: 'Conversation muted',
        // unmute: 'Conversation unmuted',
        // snooze: 'Conversation snoozed',
        // unsnooze: 'Conversation unsnoozed',
        star: 'Conversation starred',
        unstar: 'Conversation unstarred',
        // delete: 'Conversation deleted',
        deletePermanent: 'Conversation permanently deleted',
      };
      
      toast.success(actionMessages[action] || 'Action completed');
    },
    onError: (error, variables) => {
      toast.error(error.response?.data?.error || `Failed to ${variables.action}`);
    },
  });

  // Pin/Unpin
  const pinConversation = () => {
    const conversation = queryClient.getQueryData(['conversation', conversationId]);
    const action = conversation?.data?.isPinned ? 'unpin' : 'pin';
    actionMutation.mutate({ action });
  };

  // Mark as Read/Unread
  const markAsRead = () => {
    actionMutation.mutate({ action: 'markRead' });
  };

  const markAsUnread = (count = 1) => {
    actionMutation.mutate({ action: 'markUnread', data: { count } });
  };

  // Archive/Unarchive
  const archiveConversation = () => {
    // ✅ Check conversation status from multiple sources to ensure accuracy
    const conversationDetail = queryClient.getQueryData(['conversation', conversationId]);
    const conversationStatus = conversationDetail?.data?.status || conversationDetail?.status;
    
    // ✅ Also check from conversations list cache
    const conversationsCache = queryClient.getQueriesData({ queryKey: ['conversations'] });
    let foundStatus = conversationStatus;
    
    if (!foundStatus) {
      for (const [key, data] of conversationsCache) {
        if (data?.pages) {
          for (const page of data.pages) {
            const conversations = page?.data?.data || page?.data || [];
            const found = conversations.find(c => String(c._id) === String(conversationId));
            if (found?.status) {
              foundStatus = found.status;
              break;
            }
          }
        } else if (data?.data) {
          const found = data.data.find(c => String(c._id) === String(conversationId));
          if (found?.status) {
            foundStatus = found.status;
            break;
          }
        }
        if (foundStatus) break;
      }
    }
    
    const action = foundStatus === 'archived' ? 'unarchive' : 'archive';
    console.log('🔄 archiveConversation:', { conversationId, foundStatus, action });
    actionMutation.mutate({ action });
  };

  // Mute/Unmute
  const muteConversation = (until = null) => {
    actionMutation.mutate({ action: 'mute', data: { until } });
  };

  const unmuteConversation = () => {
    actionMutation.mutate({ action: 'unmute' });
  };

  // Snooze/Unsnooze
  const snoozeConversation = (until = null) => {
    actionMutation.mutate({ action: 'snooze', data: { until } });
  };

  const unsnoozeConversation = () => {
    actionMutation.mutate({ action: 'unsnooze' });
  };

  // Star/Unstar
  const starConversation = () => {
    const conversation = queryClient.getQueryData(['conversation', conversationId]);
    const action = conversation?.data?.isStarred ? 'unstar' : 'star';
    actionMutation.mutate({ action });
  };

  // Delete
  const deleteConversation = (permanent = false) => {
    const action = permanent ? 'deletePermanent' : 'delete';
    actionMutation.mutate({ action });
  };

  return {
    // Actions
    pinConversation,
    markAsRead,
    markAsUnread,
    archiveConversation,
    unarchiveConversation,
    muteConversation,
    unmuteConversation,
    snoozeConversation,
    unsnoozeConversation,
    starConversation,
    deleteConversation,
    
    // Mutation state
    isLoading: actionMutation.isPending,
    isError: actionMutation.isError,
    error: actionMutation.error,
  };
}

