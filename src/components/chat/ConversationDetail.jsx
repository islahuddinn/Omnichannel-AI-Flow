// src/components/chat/ConversationDetail.jsx

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import ConversationHeader from '@/components/chat/ConversationHeader';
import MessageTimeline from '@/components/chat/MessageTimeline';
import MessageComposer from '@/components/chat/MessageComposer';
import ContactDrawer from '@/components/chat/ContactDrawer';
import SalesforceToastListener from '@/components/chat/SalesforceToastListener';
import apiClient from '@/lib/api/client';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
import useChatStore from '@/store/useChatStore';
import { toast } from 'sonner';
import {
  MoreVertical,
  Archive,
  Pin,
  Trash2,
  Info,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ConversationDetail({
  conversationId,
  onClose,
  onMerge,
}) {
  const queryClient = useQueryClient();
  const { socket, isConnected, emit } = useSocket();
  const messagesEndRef = useRef(null);
  
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  
  const {
    conversationMap,
    messages: storeMessages,
    setMessages: setStoreMessages,
    updateConversation,
    resetUnreadCount,
  } = useChatStore();
  
  const conversation = conversationMap[conversationId];
  
  // Fetch conversation details
  const { data: convData, refetch: refetchConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiClient.get(`/conversations/${conversationId}`),
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
  
  const currentConversation = convData?.data || conversation;
  
  // Fetch messages
  const {
    data: messagesData,
    isLoading: messagesLoading,
    refetch: refetchMessages,
    hasNextPage,
    fetchNextPage,
  } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const response = await apiClient.get(`/conversations/${conversationId}/messages`, {
        params: { limit: 50, sort: 'createdAt:-1' },
      });
      return response;
    },
    staleTime: 3000,
    refetchOnWindowFocus: false,
  });
  
  const messagesList = (messagesData?.data || []).reverse();
  
  // Update store
  useEffect(() => {
    if (messagesList.length > 0) {
      setStoreMessages(conversationId, messagesList);
    }
  }, [messagesList, conversationId, setStoreMessages]);
  
  // Join conversation room on mount
  useEffect(() => {
    if (!socket || !conversationId) return;
    
    emit('conversation:join', { conversationId });
    resetUnreadCount(conversationId);
    
    return () => {
      emit('conversation:leave', { conversationId });
    };
  }, [socket, conversationId, emit, resetUnreadCount]);
  
  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);
  
  useEffect(() => {
    scrollToBottom();
  }, [messagesList, scrollToBottom]);
  
  // Real-time message updates
  useSocketEvent('message:new', useCallback((data) => {
    if (data.conversationId === conversationId) {
      console.log('📨 New message received:', data);
      refetchMessages();
      refetchConversation();
      scrollToBottom();
    }
  }, [conversationId, refetchMessages, refetchConversation, scrollToBottom]));
  
  useSocketEvent('message:status', useCallback((data) => {
    if (data.conversationId === conversationId) {
      console.log('📊 Message status updated:', data);
      refetchMessages();
    }
  }, [conversationId, refetchMessages]));
  
  useSocketEvent('message:read', useCallback((data) => {
    if (data.conversationId === conversationId) {
      refetchMessages();
    }
  }, [conversationId, refetchMessages]));
  
  useSocketEvent('conversation:update', useCallback((data) => {
    if (data.conversationId === conversationId) {
      refetchConversation();
    }
  }, [conversationId, refetchConversation]));
  
  useSocketEvent('conversation:merged', useCallback((data) => {
    // ✅ Merge event sends primaryConversationId, not conversationId
    if (String(data.primaryConversationId) === String(conversationId) ||
        data.mergedConversationIds?.includes(String(conversationId))) {
      refetchConversation();
      toast.info('Conversation merged');
    }
  }, [conversationId, refetchConversation]));
  
  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/conversations/${conversationId}/archive`),
    onSuccess: () => {
      toast.success(
        currentConversation?.isArchived ? 'Unarchived' : 'Archived'
      );
      updateConversation(conversationId, {
        isArchived: !currentConversation?.isArchived,
      });
      refetchConversation();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to archive');
    },
  });
  
  // Pin mutation
  const pinMutation = useMutation({
    mutationFn: () =>
      apiClient.put(`/conversations/${conversationId}/pin`),
    onSuccess: () => {
      toast.success(
        currentConversation?.isPinned ? 'Unpinned' : 'Pinned'
      );
      updateConversation(conversationId, {
        isPinned: !currentConversation?.isPinned,
      });
      refetchConversation();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to pin');
    },
  });
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () =>
      apiClient.delete(`/conversations/${conversationId}`),
    onSuccess: () => {
      toast.success('Conversation deleted');
      onClose();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete');
    },
  });
  
  if (!currentConversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Real-time Salesforce update toast notifications */}
      <SalesforceToastListener />
      {/* Header */}
      <ConversationHeader
        conversation={currentConversation}
        onToggleDetails={() => setShowContactDrawer(!showContactDrawer)}
      />
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading messages...</p>
          </div>
        ) : messagesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <MessageTimeline
              messages={messagesList}
              conversationId={conversationId}
              replyTo={replyTo}
              onReplyTo={(msg) => setReplyTo(msg)}
              onCancelReply={() => setReplyTo(null)}
            />
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Reply Preview */}
      {replyTo && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Replying to {replyTo.contact?.name || replyTo.sender?.firstName || 'Unknown'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {replyTo.content || replyTo.content?.text || '[Attachment]'}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setReplyTo(null)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Composer */}
      <MessageComposer
        conversationId={conversationId}
        conversation={currentConversation}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onMessageSent={() => {
          refetchMessages();
          refetchConversation();
          scrollToBottom();
        }}
      />
      
      {/* Contact Drawer */}
      {showContactDrawer && (
        <ContactDrawer
          conversation={currentConversation}
          onClose={() => setShowContactDrawer(false)}
          onMerge={onMerge}
        />
      )}
    </div>
  );
}