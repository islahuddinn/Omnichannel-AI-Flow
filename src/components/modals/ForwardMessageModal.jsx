// src/components/modals/ForwardMessageModal.jsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Send, MessageSquare, Phone, Mail, MessageCircle, Instagram, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

const channelIcons = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
  facebook: MessageCircle,
  instagram: Instagram,
  webchat: Share2
};

const channelColors = {
  whatsapp: 'text-green-500',
  sms: 'text-blue-500',
  email: 'text-gray-500',
  facebook: 'text-blue-600',
  instagram: 'text-pink-500',
  webchat: 'text-purple-500'
};

export default function ForwardMessageModal({ 
  open, 
  onClose, 
  message,
  currentConversationId 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversations, setSelectedConversations] = useState([]);
  const queryClient = useQueryClient();

  const { data: conversationsData, isLoading } = useQuery({
    queryKey: ['conversations', { search: searchQuery }],
    queryFn: () => apiClient.get('/conversations', {
      params: {
        search: searchQuery,
        status: 'active',
        limit: 50
      }
    }),
    enabled: open
  });

  const forwardMutation = useMutation({
    mutationFn: (conversationIds) => 
      apiClient.post(`/messages/${message._id}/forward`, {
        conversationIds
      }),
    onSuccess: (response) => {
      toast.success(`Message forwarded to ${selectedConversations.length} conversation(s)`);
      queryClient.invalidateQueries(['conversations']);
      onClose();
      setSelectedConversations([]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to forward message');
    }
  });

  const conversations = conversationsData?.data?.filter(
    conv => conv._id !== currentConversationId
  ) || [];

  const handleToggleConversation = (conversationId) => {
    setSelectedConversations(prev => 
      prev.includes(conversationId)
        ? prev.filter(id => id !== conversationId)
        : [...prev, conversationId]
    );
  };

  const handleForward = () => {
    if (selectedConversations.length === 0) {
      toast.error('Please select at least one conversation');
      return;
    }
    forwardMutation.mutate(selectedConversations);
  };

  // Get contact display name (same logic as ConversationList)
  const getContactDisplayName = (conversation) => {
    const contact = conversation.contactData || conversation.contact || {};
    return contact.name || 
           contact.displayName || 
           contact.phone || 
           contact.email || 
           contact.identifiers?.phone ||
           contact.identifiers?.email ||
           (conversation.channel === 'whatsapp' ? 'WhatsApp Contact' :
            conversation.channel === 'email' ? 'Email Contact' :
            conversation.channel === 'sms' ? 'SMS Contact' :
            conversation.channel === 'webchat' ? 'WebChat Visitor' :
            'Contact');
  };

  // Get contact initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get last message preview
  const getLastMessagePreview = (conversation) => {
    if (conversation.lastMessageContent) {
      return conversation.lastMessageContent;
    }
    if (conversation.lastMessageType === 'image' || conversation.lastMessageType === 'document') {
      return '📎 Media';
    }
    return 'No messages';
  };

  // Get message preview for forwarding
  const getMessagePreview = () => {
    if (message.content) {
      return message.content;
    }
    if (message.type === 'image' || message.type === 'document' || message.attachments?.length > 0) {
      return '📎 Media';
    }
    return '[Message]';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold">Forward Message</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col space-y-4 min-h-0">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400"
            />
          </div>

          {/* Message Preview */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Forwarding:
            </p>
            <p className="text-sm text-gray-900 dark:text-gray-100 break-words line-clamp-2">
              {getMessagePreview()}
            </p>
          </div>

          {/* Conversation List */}
          <ScrollArea className="flex-1 min-h-0 border border-gray-200 dark:border-gray-700 rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex items-center justify-center h-full py-8">
                <p className="text-sm text-gray-500 dark:text-gray-400">No conversations found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {conversations.map((conversation) => {
                  const contact = conversation.contactData || conversation.contact || {};
                  const displayName = getContactDisplayName(conversation);
                  const initials = getInitials(displayName);
                  const lastMessage = getLastMessagePreview(conversation);
                  const ChannelIcon = channelIcons[conversation.channel];
                  const isSelected = selectedConversations.includes(conversation._id);

                  return (
                    <div
                      key={conversation._id}
                      className={cn(
                        "flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors",
                        isSelected && "bg-blue-50 dark:bg-blue-900/20"
                      )}
                      onClick={() => handleToggleConversation(conversation._id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleConversation(conversation._id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      />
                      
                      {/* Avatar with Channel Badge */}
                      <div className="relative flex-shrink-0">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={contact.avatar} />
                          <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        {/* Channel Badge */}
                        {ChannelIcon && !conversation.isMerged && (
                          <div className={cn(
                            'absolute -bottom-1 -right-1 rounded-full p-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                            channelColors[conversation.channel]
                          )}>
                            <ChannelIcon className="h-3 w-3" />
                          </div>
                        )}
                      </div>

                      {/* Contact Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {displayName}
                          </p>
                          {conversation.isMerged && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                              Merged
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {lastMessage}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Selected Count */}
          {selectedConversations.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">
              {selectedConversations.length} conversation{selectedConversations.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-initial">
            Cancel
          </Button>
          <Button 
            onClick={handleForward}
            disabled={selectedConversations.length === 0 || forwardMutation.isPending}
            className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {forwardMutation.isPending ? 'Forwarding...' : 'Forward'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}