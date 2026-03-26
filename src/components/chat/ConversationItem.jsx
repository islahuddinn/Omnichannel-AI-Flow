// src/components/chat/ConversationItem.jsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import ChannelIcon from '@/components/shared/ChannelIcon';
import UnreadBadge from './UnreadBadge';
import MergeIndicator from './MergeIndicator';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ConversationItem({ conversation, isSelected, onClick }) {
  return (
    <div
      className={cn(
        'p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
        isSelected && 'bg-indigo-50 dark:bg-indigo-900/20'
      )}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <Avatar className="flex-shrink-0">
          <AvatarImage src={conversation.contact?.avatar} />
          <AvatarFallback>
            {conversation.contact?.name?.[0] || 'U'}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {(() => {
                const contact = conversation.contact || {};
                const phoneNumber = contact.phone || contact.identifiers?.phone || contact.identifiers?.sms;
                const shouldFormatPhone = !contact.name && !contact.displayName && phoneNumber && (conversation.channel === 'sms' || conversation.channel === 'whatsapp');
                
                if (shouldFormatPhone) {
                  return <PhoneNumberDisplay phone={phoneNumber} />;
                }
                
                return (
                  <h4 className="font-semibold text-sm truncate">
                    {contact.name || contact.displayName || contact.email || contact.phone || 'Unknown'}
                  </h4>
                );
              })()}
              {conversation.mergedConversations?.length > 0 && (
                <MergeIndicator count={conversation.mergedConversations.length} />
              )}
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {conversation.lastMessageAt
                ? formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })
                : ''}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">
              {conversation.lastMessage || 'No messages yet'}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <ChannelIcon type={conversation.channel} className="h-4 w-4" />
              {conversation.unreadCount > 0 && (
                <UnreadBadge count={conversation.unreadCount} />
              )}
            </div>
          </div>

          {/* Tags */}
          {conversation.tags?.length > 0 && (
            <div className="flex gap-1 mt-2">
              {conversation.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {conversation.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{conversation.tags.length - 2}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}