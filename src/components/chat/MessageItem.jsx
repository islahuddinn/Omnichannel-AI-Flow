// src/components/chat/MessageItem.jsx
'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import MessageBubble from './MessageBubble';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import ForwardMessageModal from '@/components/modals/ForwardMessageModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function MessageItem({ message, conversation, onReply }) {
  const { user } = useAuth();
  const [showForwardModal, setShowForwardModal] = useState(false);
  const queryClient = useQueryClient();
  
  const isOwn = message.sender?._id === user?.id || message.direction === 'outbound';

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/messages/${message._id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages', conversation._id]);
      toast.success('Message deleted');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete message');
    }
  });

  const reactMutation = useMutation({
    mutationFn: (emoji) => 
      apiClient.post(`/messages/${message._id}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries(['messages', conversation._id]);
    }
  });

  return (
    <>
      <div className={cn('flex gap-3 group', isOwn && 'flex-row-reverse')}>
        {/* Avatar */}
        {!isOwn && (
          <Avatar className="flex-shrink-0 h-8 w-8">
            <AvatarImage src={message.sender?.avatar || conversation.contact?.avatar} />
            <AvatarFallback>
              {(message.sender?.firstName?.[0] || conversation.contact?.name?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Message Content */}
        <div className={cn('flex flex-col max-w-[70%]', isOwn && 'items-end')}>
          <MessageBubble
            message={message}
            isOwn={isOwn}
            conversation={conversation}
            onReply={() => onReply?.(message)}
            onForward={() => setShowForwardModal(true)}
            onReact={(emoji) => reactMutation.mutate(emoji)}
            onDelete={() => deleteMutation.mutate()}
          />
          {/* Sender Name - Below message bubble (WhatsApp style) */}
          {((message.sender && (message.sender.role === 'agent' || message.sender.role === 'company_admin')) ||
            (message.metadata?.isBotResponse || message.sender?.role === 'bot')) && (
            <div className={cn(
              'text-[10px] mt-0.5 px-1 text-muted-foreground',
              isOwn ? 'text-right' : 'text-left'
            )}>
              {message.metadata?.isBotResponse || message.sender?.role === 'bot'
                ? 'AI Bot'
                : `${message.sender.firstName} ${message.sender.lastName}`}
            </div>
          )}
        </div>
      </div>

      {/* Forward Modal */}
      <ForwardMessageModal
        open={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        message={message}
        currentConversationId={conversation._id}
      />
    </>
  );
}