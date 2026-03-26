// src/components/panels/agent/MessagePanelWrapper.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import MessageList from '@/components/chat/MessageList';
import MessageComposer from '@/components/chat/MessageComposer';
import ConversationHeader from '@/components/chat/ConversationHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function MessagePanelWrapper({ conversationId, conversation, onToggleDetails }) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiClient.get(`/conversations/${conversationId}/messages`),
    enabled: !!conversationId
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <ConversationHeader
        conversation={conversation}
        onToggleDetails={onToggleDetails}
      />

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <MessageList
            messages={messages?.data || []}
            conversationId={conversationId}
          />
        )}
      </div>

      {/* Composer */}
      <MessageComposer conversationId={conversationId} />
    </div>
  );
}