// src/components/chat/MessageTimeline.jsx

'use client';

import { useMemo } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import MessageItem from './MessageItem';
import DateSeparator from './DateSeparator';

export default function MessageTimeline({
  messages,
  conversationId,
  replyTo,
  onReplyTo,
  onCancelReply,
}) {
  // Group messages by date
  const messagesByDate = useMemo(() => {
    const groups = {};
    
    messages.forEach((msg) => {
      const date = new Date(msg.createdAt);
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date,
          messages: [],
        };
      }
      
      groups[dateKey].messages.push(msg);
    });
    
    // Sort by date
    return Object.values(groups).sort((a, b) => a.date - b.date);
  }, [messages]);
  
  return (
    <div className="space-y-4">
      {messagesByDate.map((group) => (
        <div key={format(group.date, 'yyyy-MM-dd')}>
          {/* Date Separator */}
          <DateSeparator date={group.date} />
          
          {/* Messages for this date */}
          <div className="space-y-2 mt-3">
            {group.messages.map((message) => (
              <MessageItem
                key={message._id}
                message={message}
                conversationId={conversationId}
                isReplyTo={replyTo?._id === message._id}
                onReplyTo={onReplyTo}
                isHighlighted={replyTo?._id === message._id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}