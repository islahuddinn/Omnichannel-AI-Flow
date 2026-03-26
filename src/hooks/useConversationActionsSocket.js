// src/hooks/useConversationActionsSocket.js
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/useSocket';
import { toast } from 'sonner';

/**
 * Hook for managing conversation actions via sockets (NO API CALLS)
 * All actions are handled in real-time through socket events
 */
export function useConversationActionsSocket(conversationId) {
  const queryClient = useQueryClient();
  const { socket, emit } = useSocket();

  /**
   * Generic action emitter - sends socket event and optimistically updates cache
   */
  const performAction = (action, actionData = {}) => {
    if (!socket || !socket.connected) {
      toast.error('Not connected. Please refresh the page.');
      return;
    }

    if (!conversationId) {
      toast.error('Conversation ID is required');
      return;
    }

    // Optimistically update cache before socket event
    const optimisticUpdate = (update) => {
      queryClient.setQueryData(['conversation', conversationId], (old) => ({
        ...old,
        data: { ...old?.data, ...update },
      }));
      
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((c) =>
            String(c._id) === String(conversationId) ? { ...c, ...update } : c
          ),
        };
      });
    };

    // Handle optimistic updates based on action
    const conversation = queryClient.getQueryData(['conversation', conversationId]);
    const currentData = conversation?.data || {};

    switch (action) {
      case 'pin':
        optimisticUpdate({ isPinned: true, pinnedAt: new Date() });
        break;
      case 'unpin':
        optimisticUpdate({ isPinned: false, pinnedAt: null });
        break;
      case 'markRead':
        optimisticUpdate({ unreadCount: 0 });
        break;
      case 'markUnread':
        optimisticUpdate({ unreadCount: actionData.count || 1 });
        break;
      case 'archive':
        optimisticUpdate({ status: 'archived', archivedAt: new Date() });
        break;
      case 'unarchive':
        optimisticUpdate({ status: 'active', archivedAt: null });
        break;
      case 'mute':
        optimisticUpdate({ isMuted: true, mutedAt: new Date(), mutedUntil: actionData.until || null });
        break;
      case 'unmute':
        optimisticUpdate({ isMuted: false, mutedAt: null, mutedUntil: null });
        break;
      case 'snooze':
        optimisticUpdate({ 
          isSnoozed: true, 
          snoozedAt: new Date(), 
          snoozedUntil: actionData.until || new Date(Date.now() + 3600000) 
        });
        break;
      case 'unsnooze':
        optimisticUpdate({ isSnoozed: false, snoozedAt: null, snoozedUntil: null });
        break;
      case 'star':
        optimisticUpdate({ isStarred: true, starredAt: new Date() });
        break;
      case 'unstar':
        optimisticUpdate({ isStarred: false, starredAt: null });
        break;
      case 'delete':
        optimisticUpdate({ status: 'deleted', deletedAt: new Date() });
        break;
      case 'deletePermanent':
        // ✅ Permanently delete: Remove from all caches and invalidate all related queries
        // Remove from conversations list (handle both infinite query and regular query structures)
        queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
          if (!oldData) return oldData;
          
          // Handle infinite query structure (pages array)
          if (oldData?.pages) {
            const updatedPages = oldData.pages.map((page) => {
              const pageData = page?.data?.data || page?.data || [];
              const filteredData = pageData.filter((c) => String(c._id) !== String(conversationId));
              return {
                ...page,
                data: {
                  ...page.data,
                  data: filteredData,
                },
              };
            });
            return {
              ...oldData,
              pages: updatedPages,
            };
          }
          
          // Handle regular query structure (direct data array)
          if (oldData?.data && Array.isArray(oldData.data)) {
          return {
            ...oldData,
            data: oldData.data.filter((c) => String(c._id) !== String(conversationId)),
          };
          }
          
          return oldData;
        });
        
        // ✅ Remove all queries related to this conversation
        queryClient.removeQueries({ queryKey: ['conversation', conversationId] });
        queryClient.removeQueries({ queryKey: ['messages-infinite', conversationId] });
        queryClient.removeQueries({ queryKey: ['messages', conversationId] });
        queryClient.removeQueries({ queryKey: ['conversation-detail', conversationId] });
        break;
    }

    // Emit socket event
    socket.emit('conversation:action', {
      conversationId,
      action,
      actionData,
    });

    // Listen for success/error
    const successHandler = (data) => {
      if (String(data.conversationId) === String(conversationId) && data.action === action) {
        const actionMessages = {
          pin: 'Conversation pinned',
          unpin: 'Conversation unpinned',
          markRead: 'Conversation marked as read',
          markUnread: 'Conversation marked as unread',
          archive: 'Conversation archived',
          unarchive: 'Conversation unarchived',
          mute: 'Conversation muted',
          unmute: 'Conversation unmuted',
          snooze: 'Conversation snoozed',
          unsnooze: 'Conversation unsnoozed',
          star: 'Conversation starred',
          unstar: 'Conversation unstarred',
          delete: 'Conversation deleted',
          deletePermanent: 'Conversation permanently deleted',
        };
        toast.success(actionMessages[action] || 'Action completed');
        socket.off('conversation:action:success', successHandler);
        socket.off('conversation:action:error', errorHandler);
      }
    };

    const errorHandler = (data) => {
      if (String(data.conversationId) === String(conversationId)) {
        toast.error(data.error || `Failed to ${action}`);
        // Rollback optimistic update
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        socket.off('conversation:action:success', successHandler);
        socket.off('conversation:action:error', errorHandler);
      }
    };

    socket.once('conversation:action:success', successHandler);
    socket.once('conversation:action:error', errorHandler);
  };

  // Pin/Unpin
  const pinConversation = () => {
    const conversation = queryClient.getQueryData(['conversation', conversationId]);
    const action = conversation?.data?.isPinned ? 'unpin' : 'pin';
    performAction(action);
  };

  // Mark as Read/Unread
  const markAsRead = () => {
    performAction('markRead');
  };

  const markAsUnread = (count = 1) => {
    performAction('markUnread', { count });
  };

  // Archive/Unarchive
  const archiveConversation = (forceAction = null) => {
    // ✅ If forceAction is provided, use it directly
    if (forceAction === 'archive' || forceAction === 'unarchive') {
      console.log('🔄 archiveConversation (forced):', { conversationId, action: forceAction });
      performAction(forceAction);
      return;
    }
    
    // ✅ Check conversation status from multiple sources to ensure accuracy
    const conversationDetail = queryClient.getQueryData(['conversation', conversationId]);
    let foundStatus = conversationDetail?.data?.status || conversationDetail?.status;
    
    // ✅ Also check from conversations list cache (for archived conversations)
    if (!foundStatus) {
      const conversationsCache = queryClient.getQueriesData({ queryKey: ['conversations'] });
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
    performAction(action);
  };
  
  // ✅ Explicit unarchive function
  const unarchiveConversation = () => {
    archiveConversation('unarchive');
  };

  // Mute/Unmute
  const muteConversation = (until = null) => {
    performAction('mute', { until });
  };

  const unmuteConversation = () => {
    performAction('unmute');
  };

  // Snooze/Unsnooze
  const snoozeConversation = (until = null) => {
    performAction('snooze', { until });
  };

  const unsnoozeConversation = () => {
    performAction('unsnooze');
  };

  // Star/Unstar
  const starConversation = () => {
    const conversation = queryClient.getQueryData(['conversation', conversationId]);
    const action = conversation?.data?.isStarred ? 'unstar' : 'star';
    performAction(action);
  };

  // Delete
  const deleteConversation = (permanent = false) => {
    const action = permanent ? 'deletePermanent' : 'delete';
    performAction(action);
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
    
    // Socket state
    isConnected: socket?.connected || false,
  };
}

